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
    return new Response(JSON.stringify({ error: "Only managers can delete users" }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  const { userId } = await req.json();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Missing userId" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (userId === user.id) {
    return new Response(JSON.stringify({ error: "You cannot delete your own account" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: targetProfile } = await supabaseAdmin
    .from("profiles")
    .select("name, email")
    .eq("id", userId)
    .single();

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  await supabaseAdmin.from("activity_logs").insert({
    actor_id: user.id,
    actor_name: callerProfile?.name ?? "unknown",
    action: "deleted",
    entity_type: "user",
    entity_id: userId,
    entity_name: targetProfile?.name ?? "unknown",
    details: { email: targetProfile?.email },
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: corsHeaders,
  });
});