import { z } from "zod";
import { fail,readJson,storageFailure,teacherToken } from "@/lib/api";
import { getLessonRun,isUuid,setLessonRun } from "@/lib/store";
import { checkLimit,clientIp,limited } from "@/lib/rate-limit";
const Body=z.object({startedAt:z.number().int().nonnegative().finite().nullable(),pausedAt:z.number().int().nonnegative().finite().nullable()}).refine((s)=>s.startedAt===null?s.pausedAt===null:s.pausedAt===null||s.pausedAt>=s.startedAt);
export async function GET(request:Request,ctx:RouteContext<"/api/lessons/[id]/run">){
 if(process.env.RUN_SYNC!=="on")return Response.json({supported:false,run:null},{headers:{"Cache-Control":"no-store"}});
 const limit=await checkLimit("student",clientIp(request));if(limit)return limited(limit);
 const {id}=await ctx.params;if(!isUuid(id))return fail("not_found",404);
 try{return Response.json({supported:true,run:await getLessonRun(id)},{headers:{"Cache-Control":"no-store"}});}catch(e){return storageFailure(e);}
}
export async function POST(request:Request,ctx:RouteContext<"/api/lessons/[id]/run">){
 const limit=await checkLimit("teacher",clientIp(request));if(limit)return limited(limit);
 if(process.env.RUN_SYNC!=="on")return fail("not_configured",503);
 const {id}=await ctx.params;const token=teacherToken(request);
 if(!isUuid(id)||!token)return fail("forbidden",403);
 const raw=await readJson(request);if(raw instanceof Response)return raw;
 const parsed=Body.safeParse(raw);if(!parsed.success||parsed.data.startedAt!==null&&parsed.data.startedAt>Date.now()+60000)return fail("bad_request",400);
 try{if(!await setLessonRun(id,token,parsed.data.startedAt === null ? null : { startedAt: parsed.data.startedAt, pausedAt: parsed.data.pausedAt }))return fail("forbidden",403);return Response.json({ok:true});}catch(e){return storageFailure(e);}
}
