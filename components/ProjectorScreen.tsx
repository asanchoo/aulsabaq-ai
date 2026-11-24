"use client";
import Link from "next/link";
import { useEffect,useRef,useState,useSyncExternalStore } from "react";
import type { LessonPlan } from "@/lib/schema";
import { getDict,getClockDict,t,type Locale } from "@/lib/i18n";
import { groupTitle,segmentAt } from "@/lib/lesson";
import { parseRun,runKey,elapsedMs,type RunState } from "@/lib/run-state";
import { useLocal } from "@/lib/local";
import {useWakeLock} from "./useWakeLock";
import { modeBlock } from "./modes";
const subscribe=(callback:()=>void)=>{document.addEventListener("fullscreenchange",callback);return()=>document.removeEventListener("fullscreenchange",callback);};
const fullscreen=()=>!!document.fullscreenElement;
const supported=()=>document.fullscreenEnabled;
const server=()=>false;
export function ProjectorScreen({plan,lessonId,joinCode,lang}:{plan:LessonPlan;lessonId:string;joinCode?:string;lang:Locale}) {
  const d=getClockDict(lang),dict=getDict(lang),screen=useRef<HTMLElement>(null);
  const local=parseRun(useLocal(runKey(lessonId)));
  const [remote,setRemote]=useState<RunState|null>(null),[remoteEnabled,setRemoteEnabled]=useState(false);
  const [now,setNow]=useState(()=>Date.now());
  const run=remoteEnabled?remote:local;
  const isFull=useSyncExternalStore(subscribe,fullscreen,server);
  const canFull=useSyncExternalStore(subscribe,supported,server);
  useEffect(()=>{
    let active=true;
    async function load(){try{const r=await fetch(`/api/lessons/${lessonId}/run`,{cache:"no-store"});if(!r.ok)return;const v=await r.json();if(active&&v.supported){setRemote(v.run?parseRun(JSON.stringify(v.run)):null);setRemoteEnabled(true);}}catch{/* retain last known clock */}}
    void load();const timer=setInterval(load,5000);return()=>{active=false;clearInterval(timer);};
  },[lessonId]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const elapsed=elapsedMs(run,now),minute=Math.floor(elapsed/60000);
  useWakeLock(!!run && run.pausedAt === null && elapsed < plan.durationMin * 60000);
  const remaining=Math.max(0,Math.ceil((plan.durationMin*60000-elapsed)/60000));
  return <main ref={screen} className="projector min-h-dvh bg-white p-5 sm:p-10">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
      <div><h1 className="text-2xl font-semibold sm:text-4xl">{plan.subject}</h1><p className="mt-2 text-lg text-muted">{run?t(d.left,{n:remaining}):d.noTimer}</p></div>
      <div className="flex flex-wrap gap-2"><Link className="btn btn-secondary" href={`/${lang}/teacher/${lessonId}`}>{d.back}</Link>{canFull&&<button className="btn btn-primary" onClick={()=>{if(isFull)void document.exitFullscreen().catch(()=>undefined);else void screen.current?.requestFullscreen().catch(()=>undefined);}}>{isFull?d.exitFullscreen:d.fullscreen}</button>}</div>
    </header>
    {joinCode&&<div className="my-6 flex flex-wrap items-baseline justify-between gap-3 rounded-card bg-stage p-5"><span className="text-lg">{d.code}</span><strong className="font-mono text-4xl tracking-widest sm:text-6xl">{joinCode.slice(0,3)} {joinCode.slice(3)}</strong></div>}
    <div className={`mt-8 grid gap-5 ${plan.groups.length>1?"lg:grid-cols-2":""}`}>
      {plan.groups.map((g)=>{const segment=run?segmentAt(plan,g.id,minute):null;return <section key={g.id} className={`rounded-frame p-6 sm:p-10 ${segment?modeBlock[segment.mode]:"bg-surface"}`}>
        <h2 className="text-3xl font-semibold sm:text-5xl">{groupTitle(plan.groups,g,dict.common)}</h2>
        <p className="mt-3 text-xl sm:text-3xl">{segment?dict.modes[segment.mode]:g.topic}</p>
        {segment&&<><p className="mt-6 text-xl leading-relaxed sm:text-2xl">{segment.activity}</p><p className="mt-5 text-lg">{t(d.left,{n:Math.max(0,Math.ceil(segment.endMin-elapsed/60000))})}</p></>}
        {run&&minute>=plan.durationMin&&<p className="mt-5 text-2xl">{dict.run.ended}</p>}
      </section>;})}
    </div>
  </main>;
}
