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
void main(){shelf=marginGain;P=position;depth=depthM;F=vec4(flow.w>.5?flow.xy:flow.xy*max(.002,flow.z),flow.z,flow.w);surfSlope=vec4(0.);if(F.w>.001){vec2 p=P.xz+hydroOffset;float range=length(P.xz-cameraInPatch.xz);float draw=1.-smoothstep(163.,432.,range)*smoothstep(.64,1.4,depth);
 float h=seaLift(p,liquidTime,depth);float a=h*F.w*draw;P.y+=a;surfSlope.w=a;
 // Smooth slope of the SAME displacement used by the vertex. Include the bed-depth derivative when the breaker shoals.
 if(range<445.){float dx=(seaLift(p+vec2(.375,0.),liquidTime,depth)-h)/.375,dz=(seaLift(p+vec2(0.,.375),liquidTime,depth)-h)/.375,dd=(seaLift(p,liquidTime,depth+.016)-h)*62.5;surfSlope.xyz=vec3(dx,dz,dd)*F.w*draw;}}
 if(marginGain>.00001&&F.w<.001){float dh=marginLift(P.xz+hydroOffset,liquidTime,flow.xy*flow.z,marginGain);P.y+=dh;surfSlope.w=dh;}
 wetM=depth+surfSlope.w;vec4 eye=modelViewMatrix*vec4(P,1.);fogD=-eye.z;float zBias=min(.085*fogD,.009+.016*(1.-smoothstep(0.,.30,max(0.,wetM)))+.00038*fogD);eye.xyz*=max(.25,(fogD-zBias)/max(.25,fogD));gl_Position=projectionMatrix*eye;}`;
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
void main(){vec2 local=P.xz,p=local+hydroOffset;float tm=liquidTime,sea=smoothstep(.18,.8,F.w),speed=max(0.,F.z),pixel=max(length(dFdx(local)),length(dFdy(local))),fine=1.-smoothstep(.12,.64,pixel),middle=1.-smoothstep(.7,3.7,pixel),wide=1.-smoothstep(3.,15.,pixel);
 float eddy=.56*fieldNoise(p*.052+vec2(-tm*.038,3.1))+.44*fieldNoise(p*.155+vec2(7.4,tm*.047));
 float spdEff=max(0.,speed*(1.+.36*eddy)+.042*eddy*smoothstep(.004,.085,speed));
 float river=(1.-sea)*smoothstep(.014,.46,spdEff),pace=(1.-sea)*smoothstep(.05,.62,spdEff);
 float ew=wetM,lip=0.,edgeBand=river*smoothstep(0.,.12,shelf)*(1.-smoothstep(.04,.38,wetM));
 if(edgeBand>.002&&wetM>0.){vec2 ed=normalize(F.xy+vec2(.000001,.000002)),es=vec2(-ed.y,ed.x),vAdv=ed*(.35+1.15*speed);float c1=mod(tm*1.35,12.),c2=mod(c1+6.,12.),cw=smoothstep(.14,.86,abs(c1-6.)/6.);float tongue=mix(fieldNoise((p-vAdv*c1)*.28+es*.4),fieldNoise((p-vAdv*c2)*.28+es*.4),cw),scallop=mix(fieldNoise((p-vAdv*c1)*.72-5.3),fieldNoise((p-vAdv*c2)*.72-5.3),cw);float slosh=.62*sin(dot(p,ed*.44+es*.68)-tm*1.95+1.3*tongue)+.38*cos(dot(p,ed*.81-es*.52)-tm*1.28);float dent=edgeBand*.028*(1.-smoothstep(-.42,.52,.58*tongue+.24*scallop+.42*slosh));ew=wetM-dent;lip=edgeBand*smoothstep(.004,.052,ew)*(1.-smoothstep(.045,.16,ew))*smoothstep(-.08,.58,tongue+.45*slosh);}
 float ewf=fwidth(ew),wmf=fwidth(wetM);
 if((sea>.5||shelf>0.||depth<0.||river>.02)&&ew<=0.)discard;
 vec2 wind=vec2(.814,.581),wt=vec2(-wind.y,wind.x),rd=normalize(F.xy+vec2(.000001,.000002));float area=fieldNoise(p*.016+vec2(4.71,-43.)),wavelet=0.,scum=0.;vec2 grad=vec2(0.);
 // Open pools: independent broad wind patches and little curved capillary fans. No crossing sine gratings, even in still water.
 vec2 b=vec2(dot(p,wind),dot(p,wt));float wr=fieldNoise(b*vec2(.088,.044)+vec2(-tm*.079,.28*area)),gr=fieldNoise(b*vec2(.37,.113)+vec2(-tm*.30,wr*.94));float small=0.;if(fine>.02)small=fieldNoise(b*vec2(1.01,.367)+vec2(-tm*.61,gr*.94+wr));
 float gust=clamp(.48+.50*wr+.21*area,.12,1.);grad+=wind*(.034*wr*wide+.067*gr*middle+.028*small*fine)*gust+wt*.029*gr*middle;wavelet=(.54*wr*wide+.38*gr*middle+.08*small*fine)*gust;
 if(river>.002){vec2 velNear=rd*(.16*river+.86*speed),velFar=rd*(.58+.82*speed);
 float sec=atan(rd.y,rd.x)*1.27323954,theta=floor(sec)*.78539816;vec2 ax0=vec2(cos(theta),sin(theta)),ax1=mat2(.70710678,.70710678,-.70710678,.70710678)*ax0;float turn=smoothstep(0.,1.,fract(sec));
 float farFlow=clamp(max(smoothstep(54.,112.,fogD),smoothstep(.32,.78,pixel)),0.,1.);
 vec2 nearGrad=vec2(0.),farGrad=vec2(0.);float nearWave=0.,farWave=0.,nearScum=0.,farScum=0.;
 if(farFlow<.995){float a=mod(tm+1.9*area,7.2),b2=mod(a+3.6,7.2),w=smoothstep(.14,.86,abs(a-3.6)/3.6);
 vec4 skin=mix(movingSkin(p-velNear*a,rd,ax0,ax1,turn,pixel,depth),movingSkin(p-velNear*b2,rd,ax0,ax1,turn,pixel,depth),w);
 nearGrad=skin.xy*middle*1.13;nearWave=(1.09*skin.z+.28*skin.w)*wide;
 // Aperiodic band-limited shelf ripples ride the moving pressure packet; no periodic sine grating at shallow margins.
 if(shelf>.001&&pixel<.22){float shFine=1.-smoothstep(.07,.22,pixel);vec2 crossRun=vec2(-rd.y,rd.x);float k=mod(tm,6.4),j=mod(k+3.2,6.4),fade=smoothstep(.12,.88,abs(k-3.2)/3.2);
 vec2 q0=p-velNear*k,q1=p-velNear*j,u0=vec2(dot(q0,rd),dot(q0,crossRun)),u1=vec2(dot(q1,rd),dot(q1,crossRun));
 float r0=fieldNoise(u0*vec2(1.32,.50)+vec2(3.1,-2.4)),r1=fieldNoise(u1*vec2(1.32,.50)+vec2(3.1,-2.4));
 float ripple=mix(r0,r1,fade)*(.5+.5*fieldNoise(p*.36+vec2(7.1,-4.2)));
 float lift=smoothstep(-.02,.10,surfSlope.w);nearGrad+=(rd*(.082+.062*lift)*ripple+crossRun*.042*skin.w)*shelf*shFine;nearScum=shelf*.07*lift*smoothstep(.28,.76,ripple)*shFine;}}
 // Distant water uses bounded-celerity pressure fields in the same continuous shading model so velocity gradients never fold into contour stripes.
 if(farFlow>.005){float a3=mod(tm+2.4*area,9.6),b3=mod(a3+4.8,9.6),sw=smoothstep(.12,.88,abs(a3-4.8)/4.8);
 vec3 surf=mix(broadSkin(p-velFar*a3,rd),broadSkin(p-velFar*b3,rd),sw);float g=surf.x*.83+surf.z*.29;
 farGrad=rd*(.125*g)+vec2(-rd.y,rd.x)*(.185*surf.x);farWave=(.95*g+.28*surf.y)*wide;farScum=.085*smoothstep(.22,.68,g+.36*surf.y)*pace;}
 grad=mix(grad,mix(nearGrad,farGrad,farFlow)+wind*.014*wr*wide,river);
 wavelet=mix(wavelet,mix(nearWave,farWave,farFlow),river);
 scum+=river*mix(nearScum,farScum,farFlow);}
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
 grad*=1.-(.32-.29*sea)*calmWater;foam-=drop.z*.08*fine*calmWater;float d=max(0.,ew),deep=smoothstep(.06,2.7,d);
 vec3 geoCross=cross(dFdx(P),dFdy(P));float geoLen=length(geoCross);vec3 geoN=geoLen>1e-8?geoCross/geoLen:vec3(0.,1.,0.);if(geoN.y<0.)geoN=-geoN;
 float sinSlope=length(geoN.xz),spill=(1.-sea)*smoothstep(.085,.32,sinSlope),cascadeFoam=0.;
 float slopeBreak=(1.-sea)*clamp(length(vec2(dFdx(sinSlope),dFdy(sinSlope)))/max(.035,.09*pixel),0.,1.2);
 float footBoil=slopeBreak*smoothstep(.008,.055,sinSlope)*(1.-smoothstep(.24,.50,sinSlope));
 if(spill>.002||footBoil>.01){vec2 downDir=sinSlope>.001?geoN.xz/sinSlope:rd,crossDir=vec2(-downDir.y,downDir.x);
 float sFall=dot(p,downDir)*geoN.y-P.y*sinSlope,xCross=dot(p,crossDir);
 float sheet1=fieldNoise(vec2(xCross*.24,sFall*.15-tm*.92));
 float sWarped=sFall+(sheet1-.5)*2.6;
 float plume=fieldNoise(vec2(xCross*.62+(sheet1-.5)*.75,sWarped*.32-tm*1.58));
 float lace=middle*fieldNoise(vec2(xCross*1.45-(plume-.5)*.55,sWarped*.58-tm*2.22));
 float aerated=smoothstep(.24,.75,sheet1*.46+plume*.39+lace*.18+.18*smoothstep(.36,.82,sinSlope));
 float lipThread=smoothstep(.045,.15,sinSlope)*(1.-smoothstep(.28,.56,sinSlope))*smoothstep(.36,.78,plume*.65+sheet1*.35);
 float boilWave=fieldNoise(p*.48-downDir*(tm*1.25)+vec2(sheet1*.6,-plume*.5));
 cascadeFoam=clamp(spill*(.22+.68*aerated)+.26*lipThread+footBoil*(.28+.46*boilWave),0.,.94);
 foam=max(foam,cascadeFoam*.82);
 grad+= (downDir*(.34*(plume-.5)+.22*(sheet1-.5))+crossDir*(.24*(sheet1-.5)))*(spill+footBoil*.6);}
 vec3 n=normalize(vec3(grad.x+geoN.x*.88,max(.22,geoN.y),grad.y+geoN.z*.88)),eye=normalize(cameraInPatch-P),refl=reflect(-eye,n);
 float fres=.07+.64*pow(1.-clamp(dot(eye,n),0.,1.),3.3);
 // Unified inland freshwater body & sky reflection so flowing channels and adjacent still pools share one continuous optical medium.
 float horizon=1.-smoothstep(.015,.42,refl.y);vec3 freshSky=mix(mix(uZen,uHor,.26),uHor,.30+.62*horizon);
 if(sea<.5&&bankStation.w>.5){float stFade=1.-smoothstep(180.,680.,length(local-bankStation.xz));
 if(stFade>.005){float hor=max(.015,length(refl.xz));vec2 dir=refl.xz/hor;vec3 h=texture2D(bankSky,vec2(atan(dir.y,dir.x)*.15915494,.5)).rgb;float metres=12.*exp2(9.*h.g);
 float height=clamp(((h.r*.82-.02)*metres-(P.y-bankStation.y))/max(12.,metres-dot(local-bankStation.xz,dir)),-.035,.75);
 vec3 bankTone=mix(mix(vec3(.139,.197,.102),vec3(.065,.149,.102),h.b),uHor,.18+.26*smoothstep(90.,2100.,metres));
 freshSky=mix(freshSky,mix(bankTone,freshSky,smoothstep(height-.062,height+.075,refl.y/max(.11,hor))),stFade);}}
 vec3 freshBody=mix(mix(vec3(.122,.316,.242),vec3(.035,.147,.154),deep),mix(vec3(.108,.272,.200),vec3(.035,.143,.140),deep),.52*pace);
 freshBody=mix(freshBody,vec3(.078,.288,.276),spill*.68);
 freshBody*=1.+mix(.19,.44,pace)*wavelet+.048*area*wide;
 float rf=mix(.08,.104,pace)+mix(.64,.71,pace)*pow(1.-clamp(dot(eye,n),0.,1.),mix(3.2,2.55,pace));
 vec3 col=mix(freshBody,freshSky*(1.+.105*pace*wavelet),rf*(1.-.38*spill));
 if(sea>.002){vec3 waterSky=mix(mix(vec3(.086,.207,.239),uHor,.18),mix(uHor,uZen,.29+.38*smoothstep(-.10,.44,refl.y)),smoothstep(-.10,.44,refl.y));
 float face=smoothstep(-.26,.33,waveFace);vec3 seaBody=mix(vec3(.108,.356,.269),vec3(.020,.134,.171),deep)*(.79+.28*face+.17*surfSlope.w+.135*gr*middle);
 seaBody+=vec3(.045,.125,.072)*smoothstep(.24,.9,surfSlope.w)*smoothstep(.6,1.9,depth);
 vec3 facet=mix(seaBody,waterSky,.075+.68*pow(1.-clamp(dot(eye,n),0.,1.),2.6));
 facet*=1.+.085*wr*wide+.056*gr*middle;facet=mix(facet,mix(vec3(.098,.239,.292),uHor,.18),smoothstep(108.,520.,fogD)*.74);col=mix(col,facet,sea);}
 float gl=pow(max(0.,dot(refl,uSun)),57.);col+=vec3(.30,.287,.205)*gl*uDay*(.42+.58*middle);
 vec3 foamHue=mix(vec3(.80,.89,.84),vec3(.90,.955,.945),clamp(spill+footBoil*.5,0.,1.));
 col=mix(col,foamHue,clamp(foam,0.,.91));col*=mix(.42,1.,uDay);col=mix(col,uHor,1.-exp(-pow(max(0.,fogD)*uFog,2.)));
 float alpha=.35+.50*deep+.17*fres+.41*foam;alpha=mix(alpha,max(alpha,.55+.38*deep+.12*foam),pace*smoothstep(.08,.78,d));
 alpha=max(alpha,(spill*.80+footBoil*.55)+.18*cascadeFoam);
 alpha=mix(alpha,max(alpha,.57+.42*smoothstep(.38,1.85,d)),sea*smoothstep(.12,.85,d));
 float shGain=smoothstep(0.,.18,max(shelf,river*(1.-smoothstep(.04,.38,ew))));if(shGain>.001){float shallow=(1.-smoothstep(.025,.35,ew))*shGain;col=mix(col,vec3(.066,.181,.147)*(1.+.24*wavelet)+vec3(.45,.58,.58)*fres*.68,shallow*.46);alpha=mix(alpha,.28+.44*fres+.07*wavelet,shallow);alpha*=mix(1.,smoothstep(0.,max(.034,1.15*ewf),ew),shGain);}
 alpha*=mix(1.,smoothstep(0.,max(.034,1.05*wmf),wetM),sea);gl_FragColor=vec4(col,clamp(alpha,0.,.995));
#include <colorspace_fragment>
}`;
