import { url } from "./grid.js";
import * as T from "../vendor/three.module.min.js";
const lakeN = 6;
export function materials(u = {}) {
  const grain = new T.TextureLoader().load(
    new URL("../art/nature-grain.png", import.meta.url).href,
  );
  grain.wrapT = grain.wrapS = T.RepeatWrapping;
  grain.anisotropy = 2;
  const names = [
    "leafy_grass",
    "coast_sand_02",
    "brown_mud",
    "rock_face_03",
    "forest_ground_04",
  ];
  const surfaces = names.map((n) => {
    const t = new T.TextureLoader().load(url("library/surfaces/" + n + ".jpg"));
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
  const uniforms = {
    ...Object.fromEntries(surfaces.map((t, i) => ["ground" + i, { value: t }])),
    ...u,
    grain: { value: grain },
    summer: { value: 0 },
    actor: { value: new T.Vector4(0, 0, 0, 0) },
    cameraInPatch: { value: new T.Vector3() },
    heading: { value: new T.Vector2(0, -1) },
    wakes: {
      value: Array.from({ length: lakeN }, () => new T.Vector4(0, 0, -1000, 0)),
    },
  };
  const light = `uniform vec3 uSun,uMoon,uHor,uZen;uniform float uDay,uFog,uClock,uDetail;`;
  const land = new T.ShaderMaterial({
    uniforms,
    side: T.DoubleSide,
    vertexShader: `attribute float wear;varying float worn;attribute vec4 biome;varying vec4 m;varying vec3 P,N;varying float fogD;void main(){worn=wear;m=biome;P=position;N=normal;vec4 v=modelViewMatrix*vec4(position,1.);fogD=-v.z;gl_Position=projectionMatrix*v;}`,
    fragmentShader:
      light +
      `varying float worn;varying vec4 m;varying vec3 P,N;varying float fogD;uniform float summer;uniform sampler2D grain,ground0,ground1,ground2,ground3,ground4;
void main(){vec2 p=P.xz;vec3 n=normalize(N);float broad=.5+.23*sin(p.x*.041+sin(p.y*.061))+.18*sin(p.y*.017+p.x*.022);float tuft=.5+.5*sin(p.x*.89+1.6*sin(p.y*.57)+p.y*.38)*sin(p.y*.73-p.x*.34);
vec4 g=texture2D(grain,p*.247);vec4 j=texture2D(grain,mat2(.8,.6,-.6,.8)*p*.071);float isnear=1.-smoothstep(30.,210.,fogD);float patchTone=clamp(.19+.57*broad+(.22*tuft+(j.r-.5)*.43)*isnear,0.,1.);
vec3 grass=mix(vec3(.175,.279,.078),vec3(.375,.497,.173),patchTone);grass=mix(grass,vec3(.37,.34,.13),summer*.55);grass=mix(grass,grass*vec3(.61,.75,.72),m.w*.82);grass*=.86+.31*j.r+(g.r-.5)*.80;
vec3 sand=mix(vec3(.56,.38,.205),vec3(.84,.69,.421),broad)*(.88+.24*j.g+(g.g-.5)*.51);
vec3 mud=mix(vec3(.145,.105,.065),vec3(.313,.256,.142),broad)*(.81+.37*j.b+(g.b-.5)*.93);
float beds=.5+.5*sin(P.y*.28+p.x*.052+3.7*sin(p.y*.034)+2.1*sin(p.x*.026));vec3 stone=mix(vec3(.21,.191,.192),vec3(.503,.402,.317),broad*.73+beds*.18+(.09*j.a))*(.83+.32*j.a+(g.a-.5)*.56);
float s=clamp(m.x+(j.g-.5)*.14,0.,1.),mudw=clamp(m.y+(j.b-.5)*.13,0.,1.);vec3 col=mix(mix(grass,sand,s),mud,mudw);col=mix(col,stone,clamp(m.z+.37*smoothstep(.15,.63,1.-max(0.,n.y)),0.,1.));
vec2 uv=p*.45;vec3 grassPhoto=texture2D(ground0,uv*.78).rgb;vec3 litter=texture2D(ground4,uv*.84).rgb;vec3 shorePhoto=texture2D(ground1,uv*.69).rgb;vec3 mudPhoto=texture2D(ground2,uv*.92).rgb;vec3 rockPhoto=texture2D(ground3,vec2(p.x+.36*P.y,p.y+.22*P.y)*.27).rgb;
vec3 under=mix(grassPhoto*vec3(1.05,1.12,.95),litter,clamp(m.w*.68,0.,.68));under*=mix(vec3(1.),vec3(1.16,1.,.81),summer);vec3 albedo=mix(mix(under,shorePhoto,s),mudPhoto,mudw);albedo=mix(albedo,rockPhoto,clamp(m.z+.38*smoothstep(.16,.67,1.-n.y),0.,1.));col=mix(col,albedo, .40+.48*(1.-smoothstep(28.,130.,fogD)));
col=mix(col,mix(col*vec3(.91,.84,.70),mix(litter,mudPhoto,.28)*vec3(1.22,1.12,.89),.65),worn*(.71+.15*j.b));float diff=max(0.,dot(n,uSun));col*=mix(vec3(.37,.43,.54),vec3(.78,.82,.78)+vec3(.39,.30,.17)*diff,uDay);vec3 facet=cross(dFdx(P),dFdy(P));facet*=inversesqrt(max(dot(facet,facet),1.e-8));col*=1.+.115*m.z*(dot(facet,uSun)-dot(n,uSun));float fog=1.-exp(-pow(max(0.,fogD)*uFog,2.));col=mix(col,uHor,fog);gl_FragColor=vec4(col,1.);
#include <colorspace_fragment>
}`,
  });
  const water = new T.ShaderMaterial({
    uniforms,
    side: T.DoubleSide,
    transparent: true,
    depthWrite: false,
    vertexShader: `attribute float depthM;attribute vec4 flow;varying float depth,fogD;varying vec4 F;varying vec3 P;void main(){P=position;depth=depthM;F=flow;vec4 v=modelViewMatrix*vec4(position,1.);fogD=-v.z;gl_Position=projectionMatrix*v;}`,
    fragmentShader:
      light +
      `uniform vec3 cameraInPatch;uniform vec4 actor,wakes[6];uniform vec2 heading;uniform float uRain;varying float depth,fogD;varying vec4 F;varying vec3 P;
void main(){vec2 p=P.xz;vec2 d=normalize(F.xy+vec2(.0001,.0002));vec2 dir=mix(vec2(.89,-.46),d,min(1.,F.z*3.));vec2 t=vec2(-dir.y,dir.x);vec2 off=p-actor.xy;float near=exp(-min(40.,dot(off,off))*1.5)*actor.w;vec2 drift=p-dir*(.21+F.z*.87)*uClock+near*(off*.65+heading*.28);
float a=dot(drift,dir)*1.46+1.3*sin(dot(drift,t)*.98+1.9*sin(p.x*.23-p.y*.29))+.5*sin(p.y*.27-uClock*.39);float b=dot(drift,vec2(-.45,.89))*2.91+sin(p.x*.9+uClock*.7)+1.7*sin(p.y*.4+p.x*.23);float fine=1.-smoothstep(26.,145.,fogD);float ax=.065*cos(a)+.027*cos(b)*fine,az=.048*sin(a+.8)+.037*sin(b)*fine;
float foam=0.;if(fogD<52.){for(int i=0;i<6;i++){float age=uClock-wakes[i].z;if(age>=0.&&age<3.1){vec2 delta=p-wakes[i].xy-dir*(.17*age*F.z);float r=length(delta),front=.16+age*1.19,err=r-front;float env=exp(-abs(err)*8.)*max(0.,1.-age/3.1)*wakes[i].w;float slope=env*sin(err*18.)*.32;ax+=slope*delta.x/(.001+r);az+=slope*delta.y/(.001+r);foam+=env*.27*(.62+.38*sin(atan(delta.y,delta.x)*3.+wakes[i].z));}}}
float bow=near*(.4+.6*max(0.,dot(normalize(off+.0001),heading)))*actor.z*exp(-abs(length(off)-.39)*7.);foam+=bow*.38;
if(actor.w>.01 && dot(off,off)<24.){float behind=-dot(off,heading);float lat=dot(off,vec2(-heading.y,heading.x));float spread=.22+.34*max(0.,behind);float crest=exp(-13.*abs(abs(lat)-spread));float arm=smoothstep(-.12,.38,behind)*(1.-smoothstep(.75,4.4,behind))*actor.z;foam+=.28*crest*arm;ax+=heading.x*crest*arm*.08;az+=heading.y*crest*arm*.08;}
vec3 n=normalize(vec3(ax,1.,az));vec3 eye=normalize(cameraInPatch-P);float fres=.095+.50*pow(1.-clamp(dot(eye,n),0.,1.),3.1);float deep=smoothstep(.06,2.6,depth);vec3 base=mix(vec3(.083,.535,.448),vec3(.017,.211,.303),deep);base=mix(base,vec3(.075,.305,.425),F.w*.42);float glint=pow(max(0.,dot(reflect(-eye,n),uSun)),86.);float wr=smoothstep(.935,1.,.5+.5*sin(a+.5*cos(b)))*smoothstep(.23,.91,.5+.5*sin(b))*(1.-smoothstep(39.,160.,fogD));
float swash=.045+.028*sin(uClock*1.08+dot(p,vec2(.38,.56)));float edge=(1.-smoothstep(.012,.067,abs(depth-swash)))*(.64+.25*sin(p.x*.42+p.y*.38-uClock*.73));
vec3 col=mix(base,mix(vec3(.118,.359,.525)*mix(.46,1.,uDay),uZen,.37),fres)+vec3(.045,.094,.093)*wr+vec3(.66,.51,.29)*glint*uDay*(.26+.74*fine);col=mix(col,vec3(.77,.91,.825),clamp(edge*.82+foam,0.,.91));col*=mix(.48,1.,uDay);col=mix(col,uHor,1.-exp(-pow(max(0.,fogD)*uFog,2.)));gl_FragColor=vec4(col,clamp(.30+deep*.46+fres*.19+edge*.48+foam*.43,.31,.98));
#include <colorspace_fragment>
}`,
  });
  // Low keeps the same terrain, source textures and biome weights. Shade the actual mesh at
  // vertices and read one dominant surface per fragment instead of seven texture reads.
  const landLow = new T.ShaderMaterial({
    uniforms,
    side: T.DoubleSide,
    vertexShader: `attribute float wear;varying float worn;attribute vec4 biome;varying vec4 mixB;varying vec3 tint,lighting;varying vec2 uvM;varying float mist;uniform float uFog,uDay,summer;uniform vec3 uSun;void main(){worn=wear;vec3 n=normalize(normal);vec4 v=modelViewMatrix*vec4(position,1.);uvM=position.xz*.38;mixB=biome;mixB.z=clamp(biome.z+.38*smoothstep(.16,.67,1.-n.y),0.,1.);float broad=.5+.23*sin(position.x*.041+sin(position.z*.061))+.18*sin(position.z*.017+position.x*.022);vec3 grass=mix(vec3(.175,.279,.078),vec3(.375,.497,.173),broad);grass=mix(grass,vec3(.37,.34,.13),summer*.55);grass*=mix(vec3(1.),vec3(.61,.75,.72),biome.w*.82);tint=mix(mix(mix(grass,vec3(.75,.57,.36),biome.x),vec3(.24,.18,.10),biome.y),vec3(.34,.28,.24),mixB.z);lighting=mix(vec3(.37,.43,.54),vec3(.78,.82,.78)+vec3(.39,.30,.17)*max(0.,dot(n,uSun)),uDay);float f=clamp(-v.z*uFog,0.,1.);mist=f*f*(3.-2.*f);gl_Position=projectionMatrix*v;}`,
    fragmentShader: `varying float worn;varying vec4 mixB;varying vec3 tint,lighting;varying vec2 uvM;varying float mist;uniform vec3 uHor;uniform sampler2D ground0,ground1,ground2,ground3,ground4;void main(){vec3 surf;if(mixB.z>.48)surf=texture2D(ground3,uvM*.73).rgb;else if(mixB.y>.43)surf=texture2D(ground2,uvM*1.09).rgb;else if(mixB.x>.49)surf=texture2D(ground1,uvM*.82).rgb;else if(mixB.w>.58)surf=texture2D(ground4,uvM).rgb;else surf=texture2D(ground0,uvM*.93).rgb;vec3 base=mix(tint,surf,.61);vec3 soil=texture2D(ground4,uvM*.91).rgb*vec3(1.15,1.05,.86);vec3 col=mix(base,soil,worn*.68)*lighting;gl_FragColor=vec4(mix(col,uHor,mist),1.);\n#include <colorspace_fragment>\n}`,
  });
  // Battery Saver is a real rendering path, not just a frame counter. Retain a legible
  // shallow/deep boundary but do not evaluate reflection, glint or the six-wake loop.
  const waterSaver = new T.ShaderMaterial({
    uniforms,
    side: T.DoubleSide,
    transparent: true,
    depthWrite: false,
    vertexShader: `attribute float depthM;varying float d;void main(){d=depthM;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float d;uniform float uDay;void main(){float k=smoothstep(.05,2.6,d);vec3 c=mix(vec3(.17,.48,.40),vec3(.06,.25,.31),k)*mix(.55,1.,uDay);gl_FragColor=vec4(c,.42+.40*k);\n#include <colorspace_fragment>\n}`,
  });
  let slot = 0;
  return {
    land,
    water,
    landLow,
    waterSaver,
    uniforms,
    grain,
    surfaces,
    ripple(x, z, t, strength) {
      uniforms.wakes.value[slot++ % lakeN].set(x, z, t, strength);
    },
    resetWakes() {
      uniforms.wakes.value.forEach((w) => (w.w = 0));
      uniforms.actor.value.w = 0;
    },
  };
}
