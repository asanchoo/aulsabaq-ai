"use client";
import { useEffect, useRef, useState } from "react";
import { useLocal } from "@/lib/local";
import { parseRun,runKey } from "@/lib/run-state";
import { getClockDict,type Locale } from "@/lib/i18n";
import { saveRun } from "./LessonRunner";

/** Disabled server-side until migration is applied. Serial writes keep quick pause/shift clicks ordered. */
export function RunSync({lessonId,token,lang}:{lessonId:string;token:string;lang:Locale}) {
  const raw=useLocal(runKey(lessonId));
  const [enabled,setEnabled]=useState(false),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  const queue=useRef(Promise.resolve());const last=useRef<string|null>(null);
  useEffect(()=>{
    let active=true;
    void fetch(`/api/lessons/${lessonId}/run`,{cache:"no-store"}).then(async(response)=>{
      if(!response.ok)throw new Error();
      const result=await response.json();
      if(!active||!result.supported)return;
      const state=result.run?parseRun(JSON.stringify(result.run)):null;
      const serialized=state?JSON.stringify(state):"";
      last.current=serialized; saveRun(lessonId,state);setEnabled(true);
    }).catch(()=>{if(active)setError(true);});
    return()=>{active=false;};
  },[lessonId]);
  useEffect(()=>{
    if(!enabled||last.current===raw)return;
    const run=parseRun(raw);last.current=raw;
    queue.current=queue.current.then(async()=>{
      try {
        const response=await fetch(`/api/lessons/${lessonId}/run`,{method:"POST",headers:{"Content-Type":"application/json","x-teacher-token":token},body:JSON.stringify(run??{startedAt:null,pausedAt:null})});
        if(!response.ok)throw new Error();
        setError(false);
      }catch{last.current=null;setError(true);}
    });
  },[enabled,raw,lessonId,token,retry]);
  useEffect(()=>{if(!error||!enabled)return;const timer=setInterval(()=>setRetry((n)=>n+1),5000);return()=>clearInterval(timer);},[error,enabled]);
  return error?<p role="status" className="mt-3 text-sm text-help print:hidden">{getClockDict(lang).syncError}</p>:null;
}
