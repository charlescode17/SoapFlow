import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing auth header" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const { data: callerProfile } = await supabaseUser
    .from("profiles")
    .select("role, name")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "manager") {
    return new Response(JSON.stringify({ error: "Only managers can add users" }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  const { name, email, password, role, phone } = await req.json();

  if (!name || !email || !password || !role) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (role === "manager") {
    const { count } = await supabaseUser
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "manager");
    if ((count ?? 0) >= 2) {
      return new Response(JSON.stringify({ error: "Maximum of 2 managers allowed" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !newUser.user) {
    return new Response(JSON.stringify({ error: createError?.message ?? "Failed to create user" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: newUser.user.id,
    name,
    email,
    role,
    phone: phone ?? null,
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
    return new Response(JSON.stringify({ error: profileError.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  await supabaseAdmin.from("activity_logs").insert({
    actor_id: user.id,
    actor_name: callerProfile?.name ?? "unknown",
    action: "created",
    entity_type: "user",
    entity_id: newUser.user.id,
    entity_name: name,
    details: { name, email, role },
  });

  return new Response(JSON.stringify({ success: true, id: newUser.user.id }), {
    status: 200,
    headers: corsHeaders,
  });
});