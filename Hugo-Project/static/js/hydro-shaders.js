import { marginGLSL } from "./river-margin.js";
import { surfGLSL, shoreGLSL } from "./surf-zone.js";
import { fieldNoise } from "./ground-weave.js";
// All terrain and water programs, including Low/Battery Saver, evaluate weather IN their original surface draw.
// Stochastic impact locations, radius and timing; check neighbours so rings can straddle any partition.
export const drops = `${fieldNoise}
vec3 ringsAt(vec2 p,float t,float rain,float dist){if(rain<.018||dist>93.)return vec3(0.);p=mat2(.8,.6,-.6,.8)*p;vec2 cell=floor(p),f=fract(p),adj=step(vec2(.5),f)*2.-1.;vec3 total=vec3(0);float aa=clamp(max(length(dFdx(p)),length(dFdy(p))),.009,.048);
for(int i=0;i<4;i++){vec2 o=adj*vec2(float(i%2),float(i/2)),id=cell+o;float seed=fieldHash(id),cy=t*(.61+.49*seed)+seed*37.;id+=vec2(17.,-13.)*floor(cy);vec2 at=.08+.84*vec2(fieldHash(id+vec2(4,11)),fieldHash(id+vec2(13,-7)));vec2 delta=f-o-at;float radius=length(delta),age=fract(cy),e=radius-.016-age*(.21+.12*seed);float strength=(1.-age)*smoothstep(fieldHash(id+31.)-.09,fieldHash(id+31.)+.06,rain)*(1.-smoothstep(28.,91.,dist));float ring=(1.-smoothstep(aa*.30,aa*1.55,abs(e)))*strength,shadow=(1.-smoothstep(aa*.4,aa*1.6,abs(e+.026)))*strength;total+=vec3((ring-shadow*.78)*delta/max(.01,radius),ring);}return total;}`;
export const film = `${surfGLSL}
varying float littoral,bank;uniform float soilDamp,liquidTime,uRain;uniform vec2 hydroOffset;
${drops}
uniform sampler2D rillNear,rillFar;uniform vec2 rillCentre;uniform float rillOn;uniform vec3 cameraInPatch;
vec4 drainageAt(vec2 pos){vec2 p=pos-rillCentre;float r=max(abs(p.x),abs(p.y));if(rillOn<.5||r>=89.)return vec4(0.);vec4 far=texture2D(rillFar,.5+p/180.),m=far;if(r<24.){vec4 nearField=texture2D(rillNear,.5+p/48.);m=mix(nearField,far,smoothstep(19.,24.,r));}m.r=mix(0.,m.r,1.-smoothstep(70.,89.,r));return m;}
// One optical surface on the submitted land, with a signed lateral distance in metres. No ribbon alpha overdraw, resetting edge UVs or circular fake ponds.
float rillGlint(vec2 world,vec2 dir){vec2 q=world*2.63;return (.46*fieldNoise(q)+.29*fieldNoise(q+.65*dir)+.25*fieldNoise(q-.79*dir));}
vec3 wetSoil(vec3 dry,vec3 pos,vec2 down,float range){vec2 p=pos.xz+hydroOffset;float wet=soilDamp,pores=.52+.31*fieldNoise(p*.094+8.4)+.16*fieldNoise(p*.267);vec3 damp=dry*(1.-wet*(.16+.17*pores));if(uRain<=0.)return damp;vec4 flow=drainageAt(pos.xz);float sd=1.21*flow.r-.455,depth=.12*flow.a,grain=fieldNoise(p*.73+5.7);sd+=clamp(depth*.88,0.,.080)*(.73*grain+.27*fieldNoise(p*2.15+1.7));float aa=max(.010,.68*max(length(dFdx(pos.xz)),length(dFdy(pos.xz))));float body=smoothstep(-aa,aa,sd),rim=smoothstep(-.096-aa,.045+aa,sd);if(flow.r<.05){body=0.;rim=0.;}damp*=1.-rim*.23;
 vec2 vel=(flow.gb*2.-1.)*1.8;float speed=length(vel);vec2 dir=vel/(speed+.0001);vec3 col=damp;if(body>.001){float k=mod(liquidTime,8.),j=mod(k+4.,8.),w=smoothstep(0.,1.,abs(k-4.)*.25);float n=mix(fieldNoise((p-vel*k)*1.42+grain*.27),fieldNoise((p-vel*j)*1.42+grain*.27),w);vec2 g=down+.080*n*dir+.032*grain*vec2(-dir.y,dir.x);vec3 N=normalize(vec3(g.x,1.,g.y)),V=normalize(cameraInPatch-pos);float fres=.027+.61*pow(1.-clamp(dot(N,V),0.,1.),3.45), deep=smoothstep(.001,.135,depth);vec3 bed=damp*mix(.82,.52,deep)*vec3(.94,1.,.97);vec3 water=mix(bed,mix(uZen,uHor,.62)*(.55+.35*uDay),clamp(fres+.032*deep+.018*n,0.,.77));float streak=mix(rillGlint(p-vel*k,dir),rillGlint(p-vel*j,dir),w);float spec=smoothstep(.15,.66,.52*n+.68*streak+.11*grain)*smoothstep(-.003,.045,depth);water+=vec3(.071,.082,.079)*spec*(.42+.58*uDay);col=mix(damp,water,body);}
 // Dry soil drinks a drop; distinct expanding rings belong to a liquid film. Pond surfaces render their own impacts at the actual water level.
 if(uRain>.025&&range<69.){float ring=ringsAt(p*1.66,liquidTime,uRain,range).z;col+=vec3(.16,.19,.18)*ring*(.055*wet+body*(.30+.43*clamp(depth*19.,0.,1.)));}return col;}`;
export const waterVert = `attribute float marginGain;varying float shelf;uniform vec3 cameraInPatch;varying vec4 surfSlope;attribute float depthM;attribute vec4 flow;uniform float liquidTime;uniform vec2 hydroOffset;varying float depth,wetM,fogD;varying vec4 F;varying vec3 P;
${surfGLSL}
${marginGLSL}
void main(){shelf=marginGain;P=position;depth=depthM;F=flow;surfSlope=vec4(0.);if(F.w>.001){vec2 p=P.xz+hydroOffset;float range=length(P.xz-cameraInPatch.xz);float draw=1.-smoothstep(163.,432.,range)*smoothstep(.64,1.4,depth);
 float h=seaLift(p,liquidTime,depth);float a=h*F.w*draw;P.y+=a;surfSlope.w=a;
 // Smooth slope of the SAME displacement used by the vertex. Include the bed-depth derivative when the breaker shoals.
 if(range<445.){float dx=(seaLift(p+vec2(.375,0.),liquidTime,depth)-h)/.375,dz=(seaLift(p+vec2(0.,.375),liquidTime,depth)-h)/.375,dd=(seaLift(p,liquidTime,depth+.016)-h)*62.5;surfSlope.xyz=vec3(dx,dz,dd)*F.w*draw;}}
 if(marginGain>.00001&&F.w<.001){float dh=marginLift(P.xz+hydroOffset,liquidTime,F.xy*F.z,marginGain);P.y+=dh;surfSlope.w=dh;}
 wetM=depth+surfSlope.w;vec4 eye=modelViewMatrix*vec4(P,1.);fogD=-eye.z;gl_Position=projectionMatrix*eye;}`;
export const waterFrag = (
  lite,
) => `varying float shelf;uniform sampler2D bankSky,currentGrain;uniform vec4 bankStation;varying vec4 surfSlope;uniform vec3 cameraInPatch,uSun,uZen,uHor;uniform float uFog,uDay,uRain,liquidTime,wakeClock,calmWater;uniform vec2 hydroOffset;uniform vec4 wakes[6];varying float depth,wetM,fogD;varying vec4 F;varying vec3 P;
${shoreGLSL}
${drops}
// A backtraced parcel has a broad optical glide and, only in rough pockets, short wind/collision wavelets.
// Their compact supports are jittered in METRES. The current basis acts on a small relative vector, never on a whole map coordinate.
// The irregular spacing, fetch, angle and wavelength belong to each pocket. No tiled normal map or blanket of painted white crests.
// Ribbons follow the current over several metres. Choose adjacent fixed world axes (never multiply a map position by a spatially varying angle).
float grainAlong(vec2 q,vec2 ax,float bow,float roll){vec2 uv=vec2(dot(q,ax),dot(q,vec2(-ax.y,ax.x)));
 return fieldNoise(uv*vec2(.205,.66)+vec2(.49*roll,1.42*bow+.28*roll));}
vec4 movingSkin(vec2 q,vec2 rd,vec2 ax0,vec2 ax1,float turn,float px,float bed){
 vec2 side=vec2(-rd.y,rd.x);float bend=fieldNoise(q*.045+vec2(7.2,-3.7));vec2 w=q+side*(1.27*bend);
 float slow=fieldNoise(w*.129+vec2(5.1,9.8)),thread=fieldNoise(w*.324+rd*.49)+fieldNoise(w*.324-rd*.56);
 float shear=fieldNoise(q*.064+vec2(-32.7,41.9));float agitation=smoothstep(-.26,.52,shear+.23*slow+.13*(1.-smoothstep(.35,2.1,bed)));
 float seam=mix(grainAlong(q,ax0,bend,slow),grainAlong(q,ax1,bend,slow),turn);float lane=.19+.81*smoothstep(-.41,.42,shear-.28*bend);
 vec2 tilt=rd*(.068*slow+.037*thread)+side*(.059*bend+lane*.171*seam-.019*thread);
 float detail=1.-smoothstep(.24,1.15,px);
 if(${lite ? "false" : "true"} && detail*agitation>.008){const mat2 R=mat2(.868,.496,-.496,.868);vec2 g=R*q*(1./7.65),cell=floor(g),f=fract(g),other=step(vec2(.5),f)*2.-1.;
 for(int i=0;i<4;i++){vec2 nb=other*vec2(float(i%2),float(i/2)),id=cell+nb;uint h=fieldBits(ivec2(id));vec4 h0=vec4(uvec4(h,h>>8u,h>>16u,h>>24u)&uvec4(255u))*(1./255.);
 vec2 rel=transpose(R)*((f-nb-(.21+.58*h0.xy))*7.65);vec2 ax=normalize(rd+side*(1.76*h0.z-.76));vec2 bx=vec2(-ax.y,ax.x);float along=dot(rel,ax),crosswise=dot(rel,bx);
 vec2 r=vec2(along/(1.17+2.29*h0.w),crosswise/(1.5+2.65*h0.x));float envelope=max(0.,1.-dot(r,r));if(envelope>0.){
 float k=3.35+10.1*h0.y*h0.y;float curve=(.10+.23*h0.z)*crosswise+(.07+.04*h0.x)*crosswise*crosswise+.33*seam+.19*bend;
 float ph=k*(along+curve)*(1.+.17*r.x+.10*r.y)+6.28*h0.w,aa=1.-smoothstep(1.05,3.,px*k);float cap=.67*sin(ph)+.33*sin(ph*(.68+.41*h0.z)+2.9*h0.x+2.1*r.y)+.12*cos(1.89*ph+.7)*aa;
 tilt+=agitation*detail*envelope*envelope*(.105+.145*h0.w)*aa*cap*(ax+bx*(.12+crosswise*.095));}}}
 return vec4(tilt,(.31+.69*lane)*seam+.31*slow,.46*bend+.11*thread);}
// Meter-scale packets survive a 300–1000 m orbit. Two fixed axes blend across bends without rotating a regional coordinate by a different angle per pixel.
vec3 broadSkin(vec2 q,vec2 d){float phase=atan(d.y,d.x)*1.2732395,k=floor(phase)*.78539816;vec2 ax=vec2(cos(k),sin(k)),bx=vec2(-ax.y,ax.x),az=.7071068*(ax+bx),bz=vec2(-az.y,az.x);
 vec2 a=vec2(dot(q,ax),dot(q,bx)),b=vec2(dot(q,az),dot(q,bz));float w=smoothstep(.0,1.,fract(phase));float bow=texture2D(currentGrain,q/163.).g-.5;
 return 2.*(mix(texture2D(currentGrain,a*vec2(.009,.012)+vec2(.017,.11*bow)).rgb,texture2D(currentGrain,b*vec2(.009,.012)+vec2(.24,.13*bow)).rgb,w)-.5);}
void main(){vec2 local=P.xz,p=local+hydroOffset;float tm=liquidTime,sea=smoothstep(.18,.8,F.w),speed=max(0.,F.z),river=(1.-sea)*smoothstep(.025,.20,speed),pixel=max(length(dFdx(local)),length(dFdy(local))),fine=1.-smoothstep(.12,.64,pixel),middle=1.-smoothstep(.7,3.7,pixel),wide=1.-smoothstep(3.,15.,pixel);
 float ew=wetM,lip=0.,edgeBand=river*(1.-smoothstep(.04,.46,abs(wetM)));
 if(edgeBand>.002){vec2 ed=normalize(F.xy+vec2(.00001,.00002)),es=vec2(-ed.y,ed.x),vAdv=ed*(.35+1.15*speed);float c1=mod(tm*1.35,12.),c2=mod(c1+6.,12.),cw=smoothstep(.14,.86,abs(c1-6.)/6.);float tongue=mix(fieldNoise((p-vAdv*c1)*.28+es*.4),fieldNoise((p-vAdv*c2)*.28+es*.4),cw),scallop=mix(fieldNoise((p-vAdv*c1)*.74-5.3),fieldNoise((p-vAdv*c2)*.74-5.3),cw);float slosh=.62*sin(dot(p,ed*.44+es*.68)-tm*1.95+1.3*tongue)+.38*cos(dot(p,ed*.81-es*.52)-tm*1.28);ew+=edgeBand*(.054*tongue+.028*scallop+.046*slosh-.016);lip=edgeBand*smoothstep(0.,.055,ew)*(1.-smoothstep(.035,.15,ew))*smoothstep(-.12,.56,tongue+.5*slosh);}
 float ewf=fwidth(ew),wmf=fwidth(wetM);
 if((sea>.5||shelf>0.||depth<0.||river>.02)&&ew<=0.)discard;
 // Distant water should not compile or shade boot-scale capillaries per pixel. Use travelling pressure fields in the entire wet silhouette.
 if(sea<.005 && river>.04 && (fogD>74. || pixel>.43)){
 vec2 dir=normalize(F.xy+vec2(.00001,.00002));vec2 vel=dir*(speed+smoothstep(.06,.52,speed)*(.88+.64*sqrt(clamp(ew,0.,4.))));float a=mod(tm,26.),b=mod(a+13.,26.),swap=smoothstep(.1,.90,abs(a-13.)/13.);
 vec3 surf=mix(broadSkin(p-vel*a,dir),broadSkin(p-vel*b,dir),swap);float g=surf.x*.83+surf.z*.29,front=smoothstep(.14,.61,g+.40*surf.y);
 float d=max(0.,ew),edge=1.-smoothstep(.07,1.32,d),deep=smoothstep(.04,2.3,d);vec3 body=mix(vec3(.144,.274,.196),vec3(.064,.208,.199),deep);vec3 n=normalize(vec3(dir.x*.11*g-dir.y*surf.x*.18,1.,dir.y*.11*g+dir.x*surf.x*.18)),V=normalize(cameraInPatch-P);float refl=.12+.56*pow(1.-clamp(dot(n,V),0.,1.),2.8);
 vec3 col=mix(body,mix(uHor,uZen,.27),refl)*(.88+.73*g+.24*surf.y);col+=vec3(.071,.093,.087)*front+vec3(.085,.11,.095)*lip;
 float fold=(.42+.58*smoothstep(-.16,.42,surf.z+surf.x*.5))*edge*smoothstep(.02,.28,speed);col=mix(col,vec3(.39,.51,.423),.50*fold);col*=mix(.43,1.,uDay);col=mix(col,uHor,1.-exp(-pow(max(0.,fogD)*uFog,2.)));float alpha=mix(.47,.946,deep)+.075*fold;alpha*=smoothstep(-.001,max(.02,.8*ewf),ew);gl_FragColor=vec4(col,clamp(alpha,0.,.995));
#include <colorspace_fragment>
 return;}
 vec2 wind=vec2(.814,.581),wt=vec2(-wind.y,wind.x),rd=normalize(F.xy+vec2(.00001,.00002));float area=fieldNoise(p*.016+vec2(4.71,-43.)),wavelet=0.,scum=0.;vec2 grad=vec2(0.);
 // Open pools: independent broad wind patches and little curved capillary fans. No crossing sine gratings, even in still water.
 vec2 b=vec2(dot(p,wind),dot(p,wt));float wr=fieldNoise(b*vec2(.088,.044)+vec2(-tm*.079,.28*area)),gr=fieldNoise(b*vec2(.37,.113)+vec2(-tm*.30,wr*.94));float small=0.;if(fine>.02)small=fieldNoise(b*vec2(1.01,.367)+vec2(-tm*.61,gr*.94+wr));
 float gust=clamp(.48+.50*wr+.21*area,.12,1.);grad+=wind*(.034*wr*wide+.067*gr*middle+.028*small*fine)*gust+wt*.029*gr*middle;wavelet=(.54*wr*wide+.38*gr*middle+.08*small*fine)*gust;
 if(river>.002){float a=mod(tm+3.8*area,24.),b2=mod(a+12.,24.),w=smoothstep(.16,.84,abs(a-12.)/12.);vec2 vel=rd*(speed+smoothstep(.06,.52,speed)*(.88+.64*sqrt(clamp(wetM,0.,4.))));
 float sec=atan(rd.y,rd.x)*1.27323954,theta=floor(sec)*.78539816;vec2 ax0=vec2(cos(theta),sin(theta)),ax1=mat2(.70710678,.70710678,-.70710678,.70710678)*ax0;float turn=smoothstep(0.,1.,fract(sec));
 vec4 skin=mix(movingSkin(p-vel*a,rd,ax0,ax1,turn,pixel,depth),movingSkin(p-vel*b2,rd,ax0,ax1,turn,pixel,depth),w);
 grad=mix(grad,skin.xy*middle*1.13+wind*.012*wr*wide,river);
 // Narrow bending ripples ride a moving pressure packet on the shallow shelf. The signed sheet depth, NOT a white outline, decides where ground is wet.
 if(shelf>.001&&pixel<.57){vec2 crossRun=vec2(-rd.y,rd.x);float k=mod(tm,8.),j=mod(k+4.,8.),fade=smoothstep(.12,.88,abs(k-4.)*.25);float ripple=0.;
 for(int l=0;l<2;l++){vec2 q=p-vel*(l==0?k:j);float pocket=.5+.5*fieldNoise(q*.48+vec2(7.1,-4.2));float wrinkle=3.9*fieldNoise(q*.55)+2.16*fieldNoise(q*.93+9.5);float crest=mix(sin(dot(q,ax0)*7.3+wrinkle),sin(dot(q,ax1)*7.3+wrinkle),turn);
 float r=crest*smoothstep(.31,.73,pocket)*(l==0?1.-fade:fade);ripple+=r;}
 float lift=smoothstep(-.024,.106,surfSlope.w);grad+=rd*(.135+.105*lift)*ripple*shelf*fine+crossRun*.051*skin.w*shelf;scum+=shelf*.12*lift*smoothstep(.36,.85,ripple)*fine;}
 // Body colour changes gently over several metres. Contrast at small scales comes from reflecting light, not from dyeing each high point white.
 wavelet=mix(wavelet,(1.09*skin.z+.28*skin.w)*wide,river);}
 vec2 seaNormal=vec2(0.);float waveFace=0.,cap=0.;
 if(sea>.002){vec2 ex=dFdx(local),ey=dFdy(local);float det=ex.x*ey.y-ex.y*ey.x;
 vec2 dd=abs(det)<.0000001?vec2(0.):vec2(dFdx(depth)*ey.y-dFdy(depth)*ex.y,ex.x*dFdy(depth)-ey.x*dFdx(depth))/det;
 seaNormal=-clamp(surfSlope.xy+surfSlope.z*dd,vec2(-1.),vec2(1.));seaNormal*=1.-.90*smoothstep(2.1,10.,pixel);waveFace=clamp(dot(seaNormal,vec2(-.938,.347)),-.62,.62);
 // On the broken top of a moving body, not a set of painted concentric stripes. The trough and the steep, shoreward face stay visible.
 float high=smoothstep(.28,.93,surfSlope.w),breaker=smoothstep(.57,1.14,depth)*(1.-.81*smoothstep(2.30,3.2,depth));
 float wool=fieldNoise(p*.44+wind*(tm*.42)+gr*.48),lace=fieldNoise(p*1.19+vec2(tm*.69,wool*.62));
 cap=high*breaker*smoothstep(-.43,.48,wool*.69+lace*.26+.27*wr+.27*high)*wide;
 float tip=(1.-smoothstep(.025,.136+pixel*.021,wetM))*(.64+.19*wool);float residue=(1.-smoothstep(.76,1.78,depth))*smoothstep(.15,.66,sin(swashPhase(p,tm,depth)+.86))*smoothstep(-.045,.28,wetM);
 scum+=sea*(tip+.84*cap+.26*residue*smoothstep(.15,.68,.54*wool+.49*lace+.31*wr))*wide;
 grad=mix(grad,seaNormal+grad*1.09+wind*(.081*gr*middle+.043*small*fine),sea);wavelet+=sea*.12*surfSlope.w*wide;}
 vec3 drop=ringsAt(p*1.37,tm,uRain,fogD);grad+=drop.xy*.17*fine;float foam=scum+lip*.22+drop.z*.24*fine;
 if(fogD<52.)for(int i=0;i<${lite ? 3 : 6};i++){float age=wakeClock-wakes[i].z;if(age>=0.&&age<2.85&&wakes[i].w>.001){vec2 d=local-wakes[i].xy-rd*(.18*age*speed);float r=length(d),e=r-(.13+age*1.07),pulse=exp(-abs(e)*9.)*(1.-age/2.85)*wakes[i].w;grad+=.24*pulse*sin(e*20.)*d/(r+.03);foam+=.24*pulse;}}
 grad*=1.-(.32-.29*sea)*calmWater;foam-=drop.z*.08*fine*calmWater;float d=max(0.,ew),deep=smoothstep(.06,2.7,d);vec3 bedLight=mix(vec3(.133,.345,.266),vec3(.034,.147,.162),deep),salt=mix(vec3(.109,.43,.35),vec3(.030,.179,.247),deep);vec3 n=normalize(vec3(grad.x,1.,grad.y)),eye=normalize(cameraInPatch-P);float fres=.07+.64*pow(1.-clamp(dot(eye,n),0.,1.),3.3);vec3 col=mix(mix(bedLight,salt,sea),mix(vec3(.197,.34,.41),uZen,.31),fres);col*=1.+.19*wavelet+.045*area*wide;
 if(river>.002){vec3 refl=reflect(-eye,n);float horizon=1.-smoothstep(.015,.41,refl.y);vec3 sky=mix(mix(uZen,uHor,.25),uHor,.32+.61*horizon);vec3 bankTone=mix(vec3(.072,.147,.125),uHor,.24);
 float height=0.;if(bankStation.w>.5){float hor=max(.015,length(refl.xz));vec2 dir=refl.xz/hor;vec3 h=texture2D(bankSky,vec2(atan(dir.y,dir.x)*.15915494,.5)).rgb;float metres=12.*exp2(9.*h.g);height=clamp(((h.r*.82-.02)*metres-(P.y-bankStation.y))/max(12.,metres-dot(local-bankStation.xz,dir)),-.035,.75);
 bankTone=mix(mix(vec3(.139,.197,.102),vec3(.065,.149,.102),h.b),uHor,.18+.26*smoothstep(90.,2100.,metres));}sky=mix(bankTone,sky,smoothstep(height-.062,height+.075,refl.y/max(.11,length(refl.xz))));float rf=.105+.72*pow(1.-clamp(dot(eye,n),0.,1.),2.50);
 vec3 body=mix(vec3(.106,.267,.198),vec3(.035,.143,.139),deep)*(1.+.52*wavelet+.052*area*wide);
 col=mix(col,mix(body,sky*(1.+.118*wavelet),rf),river);}
 if(sea>.002){vec3 ray=reflect(-eye,n);float skyBand=smoothstep(-.10,.44,ray.y);vec3 waterSky=mix(mix(vec3(.086,.207,.239),uHor,.18),mix(uHor,uZen,.29+.38*skyBand),skyBand);
 float face=smoothstep(-.26,.33,waveFace);vec3 seaBody=mix(vec3(.108,.356,.269),vec3(.020,.134,.171),deep)*(.79+.28*face+.17*surfSlope.w+.135*gr*middle);
 seaBody+=vec3(.045,.125,.072)*smoothstep(.24,.9,surfSlope.w)*smoothstep(.6,1.9,depth);
 vec3 facet=mix(seaBody,waterSky,.075+.68*pow(1.-clamp(dot(eye,n),0.,1.),2.6));
 facet*=1.+.085*wr*wide+.056*gr*middle;facet=mix(facet,mix(vec3(.098,.239,.292),uHor,.18),smoothstep(108.,520.,fogD)*.74);col=mix(col,facet,sea);}
 float gl=pow(max(0.,dot(reflect(-eye,n),uSun)),57.);col+=vec3(.30,.287,.205)*gl*uDay*(.42+.58*middle);col=mix(col,vec3(.80,.89,.84),clamp(foam,0.,.87));col*=mix(.42,1.,uDay);col=mix(col,uHor,1.-exp(-pow(max(0.,fogD)*uFog,2.)));
 float alpha=.32+.49*deep+.18*fres+.41*foam;alpha=mix(alpha,max(alpha,.72+.23*deep+.12*foam),river*smoothstep(.028,.51,d));alpha=mix(alpha,max(alpha,.57+.42*smoothstep(.38,1.85,d)),sea*smoothstep(.12,.85,d));if(shelf>.001||edgeBand>.002){float shallow=1.-smoothstep(.025,.35,ew);col=mix(col,vec3(.066,.181,.147)*(1.+.28*wavelet)+vec3(.45,.58,.58)*fres*.70,shallow*(.40+.18*max(shelf,edgeBand)));alpha=mix(alpha,.30+.46*fres+.08*wavelet,shallow);alpha*=smoothstep(0.,max(.02,.82*ewf),ew);}
 alpha*=mix(1.,smoothstep(0.,max(.030,.65*wmf),wetM),sea);gl_FragColor=vec4(col,clamp(alpha,0.,.995));
#include <colorspace_fragment>
}`;
