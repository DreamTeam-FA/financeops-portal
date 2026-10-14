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
.calcav[data-s=busy] .m-frown,.calcav[data-s=stern] .m-frown,.calcav[data-s=concern] .m-frown,.calcav[data-s=confused] .m-frown{display:block}
.calcav:not([data-s=busy]):not([data-s=stern]):not([data-s=concern]):not([data-s=confused]) .m-open{display:block}
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
/* listen: you are typing — lean in, eyes down on your text, "reading" it, nodding along */
.calcav[data-s=listen] .body{transform-origin:540px 1025px;animation:cvNod 1.2s ease-in-out infinite}
@keyframes cvNod{0%,100%{transform:rotate(2deg) translateY(2px)}50%{transform:rotate(2.6deg) translateY(8px)}}
.calcav[data-s=listen] .iris{animation:cvRead 1.7s ease-in-out infinite}
@keyframes cvRead{0%,100%{transform:translate(calc(var(--bx) - 22px),calc(var(--by) + 30px)) scaleX(.95)}50%{transform:translate(calc(var(--bx) + 22px),calc(var(--by) + 30px)) scaleX(.95)}}
.calcav[data-s=listen] .brow{transform:translateY(-8px)}
.calcav[data-s=listen] .hl{transform:translate(8px,-16px) rotate(6deg)}
.calcav[data-s=listen] .hr{transform:translate(-8px,-16px) rotate(-6deg)}
/* wait: you paused — curious tilt, one brow up, finger tapping */
.calcav[data-s=wait] .body{animation:cvTilt 3.4s ease-in-out infinite}
@keyframes cvTilt{0%,100%{transform:rotate(-1deg)}50%{transform:rotate(-4.5deg) translateY(-6px)}}
.calcav[data-s=wait] .brow1{transform:translateY(-18px) rotate(-8deg)}
.calcav[data-s=wait] .hr{animation:cvTap .8s ease-in-out infinite alternate}
@keyframes cvTap{from{transform:translateY(0)}to{transform:translateY(-10px) rotate(-3deg)}}
/* ponder: working on a hard one — hand up to the chin, eyes up and aside, one brow skeptical */
.calcav[data-s=ponder] .body{animation:cvSway 3.6s ease-in-out infinite}
@keyframes cvSway{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(1.5deg) translateY(-5px)}}
.calcav[data-s=ponder] .iris{animation:cvPonder 4.2s ease-in-out infinite}
@keyframes cvPonder{0%,100%{transform:translate(calc(var(--bx) - 30px),calc(var(--by) - 44px)) scaleX(.9)}50%{transform:translate(calc(var(--bx) + 8px),calc(var(--by) - 36px)) scaleX(.9)}}
.calcav[data-s=ponder] .brow0{transform:translateY(5px) rotate(-6deg)}
.calcav[data-s=ponder] .brow1{transform:translateY(-22px) rotate(-8deg)}
.calcav[data-s=ponder] .hr{transform:translate(-120px,-8px) rotate(-26deg)}
/* write: typing the answer — both hands tapping, mouth moving, a little forward lean */
.calcav[data-s=write] .body{animation:cvWriteLean 1.4s ease-in-out infinite}
@keyframes cvWriteLean{0%,100%{transform:rotate(.8deg)}50%{transform:rotate(1.4deg) translateY(3px)}}
.calcav[data-s=write] .hl{animation:cvTapL .26s ease-in-out infinite alternate}
.calcav[data-s=write] .hr{animation:cvTapR .26s ease-in-out .13s infinite alternate}
@keyframes cvTapL{from{transform:translate(10px,-6px)}to{transform:translate(10px,-22px) rotate(4deg)}}
@keyframes cvTapR{from{transform:translate(-10px,-6px)}to{transform:translate(-10px,-22px) rotate(-4deg)}}
.calcav[data-s=write] .brow{transform:translateY(-5px)}
/* concern: bad news — worried brows (inner ends up), hands together, slow sway */
.calcav[data-s=concern] .body{animation:cvSway 4s ease-in-out infinite}
.calcav[data-s=concern] .iris{animation:none;transform:translate(calc(var(--bx) - 4px),calc(var(--by) + 14px)) scaleX(1.05)}
.calcav[data-s=concern] .brow0{transform:translateY(-10px) rotate(12deg)}
.calcav[data-s=concern] .brow1{transform:translateY(-12px) rotate(-12deg)}
.calcav[data-s=concern] .hl{transform:translate(40px,-34px) rotate(10deg)}
.calcav[data-s=concern] .hr{transform:translate(-40px,-30px) rotate(-10deg)}
/* happy: good news — one bounce, hands up, brows up, a wink */
.calcav[data-s=happy] .body{animation:cvBounce .75s ease-out 1}
.calcav[data-s=happy] .hl{transform:translateY(-28px) rotate(8deg)}
.calcav[data-s=happy] .hr{transform:translateY(-28px) rotate(-8deg)}
.calcav[data-s=happy] .brow{transform:translateY(-12px)}
.calcav[data-s=happy] .wk1{animation:cvWink 1.2s ease-in-out .35s 1}
.calcav[data-s=happy] .lidw{animation:cvLidW 1.2s ease-in-out .35s 1}
/* stern: rude or unreasonable — firm brows, squint, head shake "no", one hand up like "stop" */
.calcav[data-s=stern] .body{animation:cvNo .55s ease-in-out 3}
@keyframes cvNo{0%,100%{transform:translateX(0) rotate(0)}25%{transform:translateX(-9px) rotate(-2.5deg)}75%{transform:translateX(9px) rotate(2.5deg)}}
.calcav[data-s=stern] .eye{animation:none;transform:scaleY(.72)}
.calcav[data-s=stern] .iris{animation:none;transform:translate(var(--bx),calc(var(--by) + 6px)) scaleX(1.05)}
.calcav[data-s=stern] .brow0{transform:translateY(12px) rotate(-18deg)}
.calcav[data-s=stern] .brow1{transform:translateY(12px) rotate(18deg)}
.calcav[data-s=stern] .hr{transform:translate(-30px,-80px) rotate(-8deg)}
.calcav[data-s=stern] .hl{transform:translate(26px,10px) rotate(6deg)}
/* confused: nonsense — head tilt, uneven brows, darting eyes, shrug */
.calcav[data-s=confused] .body{animation:cvConf 2.4s ease-in-out infinite}
@keyframes cvConf{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(-7deg) translateY(-4px)}}
.calcav[data-s=confused] .iris{animation:cvDart 1.1s ease-in-out infinite}
@keyframes cvDart{0%,100%{transform:translate(calc(var(--bx) - 36px),var(--by)) scaleX(.9)}50%{transform:translate(calc(var(--bx) + 36px),var(--by)) scaleX(.9)}}
.calcav[data-s=confused] .brow0{transform:translateY(-22px) rotate(-8deg)}
.calcav[data-s=confused] .brow1{transform:translateY(10px) rotate(10deg)}
.calcav[data-s=confused] .hl{transform:translate(-14px,-26px) rotate(-12deg)}
.calcav[data-s=confused] .hr{transform:translate(14px,-26px) rotate(12deg)}
/* sleepy: heavy eyelids, slow breathing, floating z's */
.calcav[data-s=sleepy] .body{animation:cvBob 6s ease-in-out infinite}
.calcav[data-s=sleepy] .eye{animation:none;transform:scaleY(.42)}
.calcav[data-s=sleepy] .iris{animation:none;transform:translate(var(--bx),calc(var(--by) + 10px)) scaleX(1.1)}
.calcav[data-s=sleepy] .brow{transform:translateY(6px)}
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
          <g className="hl">{img(handL, P.handL)}</g>
          <g className="hr">{img(handR, P.handR)}</g>
          <text className="zz" x={800} y={150}>z</text>
          <text className="zz zz2" x={860} y={110}>Z</text>
        </g>
      </svg>
    );
  };

export default CalcAvatar;
