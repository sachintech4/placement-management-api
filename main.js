import { serve } from "https://deno.land/std@0.142.0/http/server.ts";

serve((req) => new Response("hello world"), {headers: {"Access-Control-Allow_origin": "*"}});

// http://localhost:3000
