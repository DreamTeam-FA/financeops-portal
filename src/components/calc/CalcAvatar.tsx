/**
 * Calc's animated avatar — layered artwork (body, eyes, irises, brows, hands) animated with CSS only.
 * States: idle · greet (wave + wink) · think (looks up, one brow raised) · talk (mouth moves)
 *         busy (frown, shrug, shake) · done (bounce, both hands up, wink)
 *         listen (you're typing) · wait (you paused) · ponder (hard question) · write (typing the answer)
 *         concern (bad news) · happy (good news) · stern (rude/unreasonable) · confused (nonsense) · sleepy (idle a long time)
 * Eyes also follow the cursor while Calc is idle or waiting.
 * Honors prefers-reduced-motion (everything holds still).
 */
import React, { useEffect, useId, useRef } from "react";
import plate from "./assets/plate.webp";
import eye0 from "./assets/eye0.webp";
import eye1 from "./assets/eye1.webp";
import iris0 from "./assets/iris0.webp";
import iris1 from "./assets/iris1.webp";
import browL from "./assets/browL.webp";
import browR from "./assets/browR.webp";
import handL from "./assets/handL.webp";
import handR from "./assets/handR.webp";

export type CalcAvatarState =
  | "idle" | "greet" | "think" | "talk" | "busy" | "done"
  | "listen"    // you are typing: leans in, eyes down on your text, nods along
  | "wait"      // you paused: curious head tilt, raised brow, tapping, eyes follow your cursor
  | "ponder"    // working on a hard one: hand to chin, eyes up, skeptical brow
  | "write"     // typing the answer: hands tapping, mouth moving
  | "concern"   // bad news (shortfall, overdue): worried brows, hands together
  | "happy"     // good news: one happy bounce, hands up
  | "stern"     // rude / unreasonable ask: firm brows, head shake, "stop" hand
  | "confused"  // nonsense: head tilt, uneven brows, darting eyes, shrug
  | "sleepy";   // nobody around for a while: heavy eyelids, floating z's

// Layer boxes in the original 1080 x 1080 artwork space.
const P = {
  eye0: { x: 318, y: 190, w: 193, h: 229 }, eye1: { x: 545, y: 190, w: 193, h: 229 },
  iris0: { x: 317, y: 257, w: 70, h: 117 },  iris1: { x: 544, y: 258, w: 80, h: 116 },
  browL: { x: 253, y: 49, w: 258, h: 117 },  browR: { x: 553, y: 75, w: 246, h: 157 },
  handL: { x: 0, y: 502, w: 265, h: 296 },   handR: { x: 821, y: 352, w: 244, h: 305 },
};
const EYE_C = [{ x: 414.5, y: 304.5 }, { x: 641.5, y: 304.5 }];
// How far each iris must move (px, artwork space) to sit dead-centre in its eyeball ("looking at you").
const CENTER_SHIFT = [{ x: 62.5, y: -11 }, { x: 57.5, y: -11.5 }];

const MOUTH = "M398 518 Q540 548 676 496 Q650 572 586 602 Q514 572 462 531 Q430 524 398 518 Z";

const CSS = `
.calcav{overflow:visible;display:block}
.calcav .body{transform-origin:540px 1025px;animation:cvBob 3.2s ease-in-out infinite}
@keyframes cvBob{50%{transform:translateY(-9px)}}
.calcav .eye,.calcav .wk{transform-box:fill-box;transform-origin:center}
.calcav .eye{animation:cvBlink 4.6s infinite}
@keyframes cvBlink{0%,92%{transform:scaleY(1);opacity:1}94%{transform:scaleY(.08);opacity:1}94.1%,96%{transform:scaleY(.05);opacity:0}96.1%{transform:scaleY(.08);opacity:1}98%,100%{transform:scaleY(1);opacity:1}}
.calcav .lid{opacity:0;animation:cvLid 4.6s infinite}
@keyframes cvLid{0%,94%{opacity:0}94.1%,96%{opacity:1}96.1%,100%{opacity:0}}
.calcav .lidw{opacity:0}
.calcav .iris{transform-box:fill-box;transform-origin:center;transition:transform .25s ease-out;transform:translate(var(--bx),var(--by)) scaleX(1.2);animation:cvLook 11s ease-in-out infinite}
@keyframes cvLook{0%,38%{transform:translate(var(--bx),var(--by)) scaleX(1.2)}42%,58%{transform:translate(calc(var(--bx) - 44px),var(--by)) scaleX(.85)}62%,78%{transform:translate(calc(var(--bx) + 44px),var(--by)) scaleX(.85)}82%,100%{transform:translate(var(--bx),var(--by)) scaleX(1.2)}}
.calcav .brow{transform-box:fill-box;transform-origin:center;transition:transform .3s ease-out}
.calcav .m{display:none}
.calcav[data-s=busy] .m-frown,.calcav[data-s=concern] .m-frown{display:block}
.calcav[data-s=stern] .m-flat,.calcav[data-s=ponder] .m-flat{display:block}
.calcav[data-s=confused] .m-wavy{display:block}
.calcav[data-s=listen] .m-o,.calcav[data-s=wait] .m-o{display:block}
.calcav:not([data-s=busy]):not([data-s=concern]):not([data-s=stern]):not([data-s=ponder]):not([data-s=confused]):not([data-s=listen]):not([data-s=wait]) .m-open{display:block}
.calcav[data-s=talk] .m-open,.calcav[data-s=write] .m-open{animation:cvTalk .22s ease-in-out infinite alternate;transform-origin:537px 520px}
.calcav[data-s=sleepy] .m-open{transform:scaleY(.22);transform-origin:537px 520px}
@keyframes cvTalk{from{transform:scaleY(.3)}to{transform:scaleY(1)}}
#hl{transform-origin:130px 790px}
.calcav .hl{transform-origin:130px 790px;transition:transform .3s ease-out}
.calcav .hr{transform-origin:935px 650px;transition:transform .3s ease-out}
/* think */
.calcav[data-s=think] .iris{animation:cvThink 3.4s ease-in-out infinite}
@keyframes cvThink{0%,100%{transform:translate(calc(var(--bx) - 26px),calc(var(--by) - 40px)) scaleX(.95)}50%{transform:translate(calc(var(--bx) + 26px),calc(var(--by) - 40px)) scaleX(.95)}}
.calcav[data-s=think] .brow1{transform:translateY(-20px) rotate(-5deg)}
/* talk / greet / done: look straight at the user */
.calcav[data-s=talk] .iris,.calcav[data-s=greet] .iris,.calcav[data-s=done] .iris,.calcav[data-s=write] .iris,.calcav[data-s=happy] .iris{animation:none}
.calcav[data-s=talk] .brow{transform:translateY(-6px)}
/* greet: wave + wink + hop */
.calcav[data-s=greet] .hr{animation:cvWave .45s ease-in-out infinite alternate}
@keyframes cvWave{from{transform:rotate(-14deg)}to{transform:rotate(14deg)}}
.calcav[data-s=greet] .wk1{animation:cvWink 1.5s ease-in-out .5s 1}
.calcav[data-s=greet] .lidw{animation:cvLidW 1.5s ease-in-out .5s 1}
.calcav[data-s=greet] .body{animation:cvHop .7s ease-out 2}
@keyframes cvWink{0%,100%{transform:scaleY(1)}18%,62%{transform:scaleY(.05)}80%{transform:scaleY(1)}}
@keyframes cvLidW{0%,17%{opacity:0}18%,62%{opacity:1}63%,100%{opacity:0}}
@keyframes cvHop{45%{transform:translateY(-34px)}}
/* done: bounce + hands up + wink */
.calcav[data-s=done] .body{animation:cvBounce .75s ease-out 2}
@keyframes cvBounce{0%{transform:scale(1,1)}18%{transform:scale(1.03,.95)}45%{transform:translateY(-46px) scale(.98,1.04)}72%{transform:translateY(0) scale(1.03,.96)}100%{transform:scale(1,1)}}
.calcav[data-s=done] .hl{transform:translateY(-34px) rotate(8deg)}
.calcav[data-s=done] .hr{transform:translateY(-34px) rotate(-8deg)}
.calcav[data-s=done] .wk1{animation:cvWink 1.2s ease-in-out .3s 1}
.calcav[data-s=done] .lidw{animation:cvLidW 1.2s ease-in-out .3s 1}
.calcav[data-s=done] .brow{transform:translateY(-12px)}
/* busy: frown, shrug, shake, eyes down and aside */
.calcav[data-s=busy] .body{animation:cvShake .4s ease-in-out 3}
@keyframes cvShake{25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
.calcav[data-s=busy] .iris{animation:none;transform:translate(calc(var(--bx) - 22px),calc(var(--by) + 20px)) scaleX(.9)}
.calcav[data-s=busy] .brow0{transform:translateY(6px) rotate(-14deg)}
.calcav[data-s=busy] .brow1{transform:translateY(6px) rotate(14deg)}
.calcav[data-s=busy] .hl{transform:translate(-10px,-22px) rotate(-14deg)}
.calcav[data-s=busy] .hr{transform:translate(10px,-22px) rotate(14deg)}
/* eyes follow the cursor while Calc is idle / waiting (set by JS, only while the pointer is moving) */
.calcav[data-track="1"][data-s=idle] .iris,.calcav[data-track="1"][data-s=wait] .iris{animation:none;transform:translate(calc(var(--bx) + var(--lx,0px)),calc(var(--by) + var(--ly,0px))) scaleX(1.1)}
.calcav .hlid,.calcav .sym{display:none}
.calcav .hl,.calcav .hr{transition:transform .35s cubic-bezier(.3,1.4,.5,1)}

/* ── listen: you're typing — hand cupped behind the ear, leaning in, eyes down reading your text, small "o" mouth ── */
.calcav[data-s=listen] .body{transform-origin:540px 1025px;animation:cvNod 1.2s ease-in-out infinite}
@keyframes cvNod{0%,100%{transform:rotate(2.5deg) translateY(2px)}50%{transform:rotate(3.2deg) translateY(9px)}}
.calcav[data-s=listen] .iris{animation:cvRead 1.7s ease-in-out infinite}
@keyframes cvRead{0%,100%{transform:translate(calc(var(--bx) - 22px),calc(var(--by) + 32px)) scaleX(.95)}50%{transform:translate(calc(var(--bx) + 22px),calc(var(--by) + 32px)) scaleX(.95)}}
.calcav[data-s=listen] .brow{transform:translateY(-10px)}
.calcav[data-s=listen] .hr{transform:translate(-95px,-255px) rotate(-18deg) scale(1.06)}
.calcav[data-s=listen] .hl{transform:translate(18px,-20px) rotate(8deg)}

/* ── wait: you paused — head tilt, one brow up, left hand on hip, right hand drumming ── */
.calcav[data-s=wait] .body{animation:cvTilt 3.4s ease-in-out infinite}
@keyframes cvTilt{0%,100%{transform:rotate(-1deg)}50%{transform:rotate(-5deg) translateY(-6px)}}
.calcav[data-s=wait] .brow1{transform:translateY(-20px) rotate(-8deg)}
.calcav[data-s=wait] .brow0{transform:translateY(4px) rotate(-3deg)}
.calcav[data-s=wait] .hl{transform:translate(200px,70px) rotate(18deg)}
.calcav[data-s=wait] .hr{transform:translate(-55px,150px) rotate(-8deg);animation:cvDrum .55s ease-in-out infinite alternate}
@keyframes cvDrum{from{transform:translate(-55px,150px) rotate(-8deg)}to{transform:translate(-55px,128px) rotate(-14deg)}}

/* ── think: one eye squinted, hand at the temple, eyes up and aside ── */
.calcav[data-s=think] .wk1 .eye{animation:none;transform:scaleY(.42)}
.calcav[data-s=think] .hr{transform:translate(-120px,-262px) rotate(-14deg)}
.calcav[data-s=think] .brow0{transform:translateY(4px) rotate(-4deg)}

/* ── ponder: hard one — hand holding the chin, both eyes squinted, eyes up, flat "hmm" mouth, dots above ── */
.calcav[data-s=ponder] .body{animation:cvSway 3.6s ease-in-out infinite}
@keyframes cvSway{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(1.8deg) translateY(-5px)}}
.calcav[data-s=ponder] .eye{animation:none;transform:scaleY(.6)}
.calcav[data-s=ponder] .iris{animation:cvPonder 4.2s ease-in-out infinite}
@keyframes cvPonder{0%,100%{transform:translate(calc(var(--bx) - 30px),calc(var(--by) - 40px)) scaleX(.9)}50%{transform:translate(calc(var(--bx) + 10px),calc(var(--by) - 32px)) scaleX(.9)}}
.calcav[data-s=ponder] .brow0{transform:translateY(8px) rotate(-8deg)}
.calcav[data-s=ponder] .brow1{transform:translateY(-24px) rotate(-10deg)}
.calcav[data-s=ponder] .hr{transform:translate(-225px,-30px) rotate(-38deg);animation:cvChin 2.4s ease-in-out infinite}
@keyframes cvChin{0%,100%{transform:translate(-225px,-30px) rotate(-38deg)}50%{transform:translate(-215px,-42px) rotate(-33deg)}}
.calcav[data-s=ponder] .dots{display:block}
.calcav .dots circle{animation:cvDot 1.2s ease-in-out infinite}
.calcav .dots circle:nth-child(2){animation-delay:.2s}.calcav .dots circle:nth-child(3){animation-delay:.4s}
@keyframes cvDot{0%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-16px);opacity:1}}

/* ── write: typing the answer — both hands down on the keypad tapping, mouth moving, leaning in ── */
.calcav[data-s=write] .body{animation:cvWriteLean 1.4s ease-in-out infinite}
@keyframes cvWriteLean{0%,100%{transform:rotate(.8deg)}50%{transform:rotate(1.6deg) translateY(3px)}}
.calcav[data-s=write] .hl{animation:cvTapL .24s ease-in-out infinite alternate}
.calcav[data-s=write] .hr{animation:cvTapR .24s ease-in-out .12s infinite alternate}
@keyframes cvTapL{from{transform:translate(262px,172px) rotate(14deg)}to{transform:translate(262px,146px) rotate(10deg)}}
@keyframes cvTapR{from{transform:translate(-238px,286px) rotate(-14deg)}to{transform:translate(-238px,262px) rotate(-10deg)}}
.calcav[data-s=write] .eye{animation:cvBlink 3s infinite}
.calcav[data-s=write] .brow{transform:translateY(-6px)}

/* ── concern: bad news — wide worried eyes, brows pinched up, hands clasped at the chest, sweat drop, frown ── */
.calcav[data-s=concern] .body{animation:cvSway 4s ease-in-out infinite}
.calcav[data-s=concern] .wk{transform:scale(1.1)}
.calcav[data-s=concern] .iris{animation:none;transform:translate(calc(var(--bx) - 4px),calc(var(--by) + 16px)) scaleX(1.05)}
.calcav[data-s=concern] .brow0{transform:translateY(-12px) rotate(15deg)}
.calcav[data-s=concern] .brow1{transform:translateY(-14px) rotate(-15deg)}
.calcav[data-s=concern] .hl{transform:translate(340px,-5px) rotate(24deg)}
.calcav[data-s=concern] .hr{transform:translate(-335px,135px) rotate(-26deg)}
.calcav[data-s=concern] .sweat{display:block;animation:cvSweat 1.8s ease-in infinite}
@keyframes cvSweat{0%{transform:translateY(-14px);opacity:0}25%{opacity:1}100%{transform:translateY(40px);opacity:0}}

/* ── happy: good news — eyes squeezed into happy arcs, big grin, both arms flung up cheering, sparkles ── */
.calcav[data-s=happy] .body{animation:cvBounce .75s ease-out 2}
.calcav[data-s=happy] .wk{opacity:0}
.calcav[data-s=happy] .hlid{display:block}
.calcav[data-s=happy] .m-open{transform:scaleY(1.2);transform-origin:537px 520px}
.calcav[data-s=happy] .brow{transform:translateY(-14px)}
.calcav[data-s=happy] .hl{transform:translate(30px,-330px) rotate(-16deg);animation:cvCheerL .5s ease-in-out infinite alternate}
.calcav[data-s=happy] .hr{transform:translate(-30px,-205px) rotate(16deg);animation:cvCheerR .5s ease-in-out .12s infinite alternate}
@keyframes cvCheerL{from{transform:translate(30px,-330px) rotate(-22deg)}to{transform:translate(30px,-350px) rotate(-8deg)}}
@keyframes cvCheerR{from{transform:translate(-30px,-205px) rotate(22deg)}to{transform:translate(-30px,-225px) rotate(8deg)}}
.calcav[data-s=happy] .spark{display:block}
.calcav .spark text{animation:cvTwinkle 1s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:center}
.calcav .spark text:nth-child(2){animation-delay:.3s}.calcav .spark text:nth-child(3){animation-delay:.6s}
@keyframes cvTwinkle{from{opacity:.3;transform:scale(.7)}to{opacity:1;transform:scale(1.25)}}

/* ── stern: rude / unreasonable — tight squint, heavy angled brows, flat mouth, head shake "no", palm up in "stop" ── */
.calcav[data-s=stern] .body{animation:cvNo .55s ease-in-out 4}
@keyframes cvNo{0%,100%{transform:translateX(0) rotate(0)}25%{transform:translateX(-10px) rotate(-3deg)}75%{transform:translateX(10px) rotate(3deg)}}
.calcav[data-s=stern] .eye{animation:none;transform:scaleY(.4)}
.calcav[data-s=stern] .iris{animation:none;transform:translate(var(--bx),calc(var(--by) + 2px)) scaleX(1.05)}
.calcav[data-s=stern] .brow0{transform:translateY(18px) rotate(-22deg)}
.calcav[data-s=stern] .brow1{transform:translateY(20px) rotate(22deg)}
.calcav[data-s=stern] .hr{transform:translate(-45px,-215px) rotate(-6deg) scale(1.18)}
.calcav[data-s=stern] .hl{transform:translate(196px,66px) rotate(20deg)}
.calcav[data-s=stern] .bang{display:block;animation:cvBang .5s ease-in-out infinite alternate}
@keyframes cvBang{from{transform:scale(.9) rotate(-6deg)}to{transform:scale(1.2) rotate(6deg)}}

/* ── confused: nonsense — head tilt, uneven brows, darting eyes, wavy mouth, shrug with both palms up, a "?" ── */
.calcav[data-s=confused] .body{animation:cvConf 2.4s ease-in-out infinite}
@keyframes cvConf{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(-8.5deg) translateY(-4px)}}
.calcav[data-s=confused] .iris{animation:cvDart 1.1s ease-in-out infinite}
@keyframes cvDart{0%,100%{transform:translate(calc(var(--bx) - 38px),var(--by)) scaleX(.9)}50%{transform:translate(calc(var(--bx) + 38px),var(--by)) scaleX(.9)}}
.calcav[data-s=confused] .wk0 .eye{animation:none;transform:scaleY(.6)}
.calcav[data-s=confused] .brow0{transform:translateY(-24px) rotate(-10deg)}
.calcav[data-s=confused] .brow1{transform:translateY(12px) rotate(12deg)}
.calcav[data-s=confused] .hl{transform:translate(-38px,-135px) rotate(-26deg)}
.calcav[data-s=confused] .hr{transform:translate(32px,-110px) rotate(26deg)}
.calcav[data-s=confused] .qm{display:block;animation:cvWiggle 1.1s ease-in-out infinite}
@keyframes cvWiggle{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(12deg) translateY(-10px)}}

/* ── sleepy: nobody around — eyes nearly shut, arms hanging low, slow breathing, floating z's ── */
.calcav[data-s=sleepy] .body{animation:cvBob 6s ease-in-out infinite}
.calcav[data-s=sleepy] .eye{animation:none;transform:scaleY(.16)}
.calcav[data-s=sleepy] .iris{animation:none;transform:translate(var(--bx),calc(var(--by) + 10px)) scaleX(1.1)}
.calcav[data-s=sleepy] .brow{transform:translateY(8px)}
.calcav[data-s=sleepy] .hl{transform:translate(8px,120px) rotate(4deg)}
.calcav[data-s=sleepy] .hr{transform:translate(-8px,270px) rotate(-4deg)}
.calcav .zz{display:none;font:700 70px sans-serif;fill:#6b7a99}
.calcav[data-s=sleepy] .zz{display:block;animation:cvZ 3s ease-in-out infinite}
.calcav[data-s=sleepy] .zz2{animation-delay:1.4s}
@keyframes cvZ{0%{opacity:0;transform:translate(0,0)}25%{opacity:1}100%{opacity:0;transform:translate(46px,-120px)}}
@media (prefers-reduced-motion:reduce){.calcav *{animation:none!important;transition:none!important}}
`;

export const CalcAvatar: React.FC<{ state?: CalcAvatarState; size?: number | string; className?: string; label?: string }> =
  ({ state = "idle", size = 64, className = "", label = "Calc" }) => {
    const uid = useId().replace(/:/g, "");
    const svgRef = useRef<SVGSVGElement>(null);
    // Eyes follow the cursor while the pointer is moving (CSS only uses this in the idle / wait states).
    useEffect(() => {
      const el = svgRef.current; if (!el) return;
      let raf = 0, off: ReturnType<typeof setTimeout> | undefined;
      const onMove = (e: PointerEvent) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = el.getBoundingClientRect();
          if (!r.width) return;
          const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
          const nx = Math.max(-1, Math.min(1, dx / 320)), ny = Math.max(-1, Math.min(1, dy / 320));
          el.style.setProperty("--lx", (nx * 30).toFixed(1) + "px");
          el.style.setProperty("--ly", (ny * 20).toFixed(1) + "px");
          el.setAttribute("data-track", "1");
          if (off) clearTimeout(off);
          off = setTimeout(() => el.removeAttribute("data-track"), 3500);
        });
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      return () => { window.removeEventListener("pointermove", onMove); if (raf) cancelAnimationFrame(raf); if (off) clearTimeout(off); };
    }, []);
    const img = (src: string, p: { x: number; y: number; w: number; h: number }) => (
      <image href={src} x={p.x} y={p.y} width={p.w} height={p.h} />
    );
    const eye = (k: 0 | 1) => {
      const c = EYE_C[k], e = k === 0 ? P.eye0 : P.eye1, ir = k === 0 ? P.iris0 : P.iris1;
      return (
        <g key={k}>
          <clipPath id={`cp${k}${uid}`}><ellipse cx={c.x} cy={c.y} rx={92} ry={110} /></clipPath>
          <g className={`wk wk${k}`}>
            <g className="eye">
              {img(k === 0 ? eye0 : eye1, e)}
              <g clipPath={`url(#cp${k}${uid})`}>
                <g className="iris" style={{ ["--bx" as any]: `${CENTER_SHIFT[k].x}px`, ["--by" as any]: `${CENTER_SHIFT[k].y}px` }}>
                  {img(k === 0 ? iris0 : iris1, ir)}
                </g>
              </g>
            </g>
          </g>
          <path className="lid" d={`M${c.x - 82} ${c.y - 4} Q${c.x} ${c.y + 22} ${c.x + 82} ${c.y - 4}`} fill="none" stroke="#161616" strokeWidth={9} strokeLinecap="round" />
          {k === 1 && <path className="lidw" d={`M${c.x - 82} ${c.y - 4} Q${c.x} ${c.y + 22} ${c.x + 82} ${c.y - 4}`} fill="none" stroke="#161616" strokeWidth={9} strokeLinecap="round" />}
        </g>
      );
    };
    return (
      <svg ref={svgRef} className={`calcav ${className}`} data-s={state} viewBox="0 0 1080 1080" width={size} height={size} role="img" aria-label={label}>
        <style>{CSS}</style>
        <g className="body">
          <image href={plate} x={0} y={0} width={1080} height={1080} />
          {eye(0)}
          {eye(1)}
          <g className="brow brow0">{img(browL, P.browL)}</g>
          <g className="brow brow1">{img(browR, P.browR)}</g>
          <clipPath id={`mc${uid}`}><path d={MOUTH} /></clipPath>
          <g className="m m-open">
            <path d={MOUTH} fill="#141414" stroke="#000" strokeWidth={6} strokeLinejoin="round" />
            <g clipPath={`url(#mc${uid})`}>
              <path d="M470 530 Q545 552 668 502 L664 516 Q548 566 482 548 Z" fill="#fff" />
              <ellipse cx={584} cy={584} rx={26} ry={13} transform="rotate(-24 584 584)" fill="#F2909F" />
            </g>
            <path d="M672 497 L685 489" stroke="#000" strokeWidth={6} strokeLinecap="round" />
          </g>
          <g className="m m-frown"><path d="M416 578 Q540 506 664 578" fill="none" stroke="#141414" strokeWidth={8} strokeLinecap="round" /></g>
          <g className="m m-flat"><path d="M430 566 L650 560" fill="none" stroke="#141414" strokeWidth={9} strokeLinecap="round" /></g>
          <g className="m m-wavy"><path d="M410 572 Q460 538 510 572 T610 572 T672 560" fill="none" stroke="#141414" strokeWidth={8} strokeLinecap="round" /></g>
          <g className="m m-o"><ellipse cx={540} cy={560} rx={34} ry={40} fill="#141414" stroke="#000" strokeWidth={6} /><ellipse cx={546} cy={578} rx={18} ry={12} fill="#F2909F" /></g>
          {[EYE_C[0], EYE_C[1]].map((c, i) => (
            <path key={"hl" + i} className="hlid" d={`M${c.x - 84} ${c.y + 14} Q${c.x} ${c.y - 70} ${c.x + 84} ${c.y + 14}`} fill="none" stroke="#161616" strokeWidth={14} strokeLinecap="round" />
          ))}
          <g className="hl">{img(handL, P.handL)}</g>
          <g className="hr">{img(handR, P.handR)}</g>
          <g className="sym dots"><circle cx={770} cy={70} r={14} fill="#6b7a99" /><circle cx={820} cy={70} r={14} fill="#6b7a99" /><circle cx={870} cy={70} r={14} fill="#6b7a99" /></g>
          <path className="sym sweat" d="M800 170 Q770 215 800 240 Q830 215 800 170 Z" fill="#7ec8f2" stroke="#3d8fc4" strokeWidth={5} />
          <g className="sym spark"><text x={90} y={170} fontSize={90} fill="#f5b400">✦</text><text x={880} y={130} fontSize={110} fill="#f5b400">✦</text><text x={60} y={420} fontSize={70} fill="#f5b400">✦</text></g>
          <text className="sym bang" x={820} y={140} fontSize={130} fontWeight={800} fill="#d93a2f" style={{ transformBox: "fill-box", transformOrigin: "center" }}>!</text>
          <text className="sym qm" x={810} y={150} fontSize={140} fontWeight={800} fill="#2f6fc9" style={{ transformBox: "fill-box", transformOrigin: "center" }}>?</text>
          <text className="zz" x={800} y={150}>z</text>
          <text className="zz zz2" x={860} y={110}>Z</text>
        </g>
      </svg>
    );
  };

export default CalcAvatar;
