"""Bake restrained, sagittal-plane jumps from each traveller's own neutral stance.
No upstream motion download needed (numpy, scipy). Bone tracks in the atlas are absolute in rig space.
"""
from pathlib import Path
import gzip,json,math
import numpy as np
from scipy.spatial.transform import Rotation as R
root=Path(__file__).resolve().parents[1]/'static/library/models'
def rx(deg):return R.from_euler('x',deg,degrees=True)
# Phase, thigh, shin, shoe pitch, upper arm, forearm, trunk, hip sink, left/right running bias (degrees, metres).
flight=[[0,12,-15,4,-13,7,-9,.054,1],[.16,4,-5,11,13,37,-5,.015,2],[.49,19,-26,9,31,55,-5,.002,4],[.64,17,-21,6,24,45,-4,.003,3],[.89,6,-6,1,3,20,-5,.004,2],[1,9,-8,0,-4,18,-7,.010,1]]
settle=[[0,9,-8,0,-4,18,-7,.01,1],[.29,30,-29,-2,-13,22,-14,.136,2],[.56,23,-21,-1,-10,16,-10,.088,2],[1,0,0,0,0,0,0,0,0]]
ledge=[[0,14,-18,3,28,55,-9,.025,2],[.38,23,-32,5,62,80,-13,.018,3],[.74,28,-20,1,36,7,-16,.08,4],[1,10,-10,0,-5,12,-6,.015,2]]
for style in ('man','woman'):
 f=root/f'traveller-{style}.model.gz';d=json.loads(gzip.decompress(f.read_bytes()));ref=np.array(d['clips']['stand']['poses'][3]).reshape(-1,7);bones=d['bones'];ix={b['name']:i for i,b in enumerate(bones)}
 for name,table in [('field-hop',flight),('field-absorb',settle),('field-ledge',ledge)]:
  poses=[]
  for t in np.linspace(0,1,21):
   i=next(i for i in range(len(table)-1) if t<=table[i+1][0]);a,b=np.array(table[i]),np.array(table[i+1]);u=(t-a[0])/(b[0]-a[0]);u=u*u*(3-2*u);_,th,sh,shoe,arm,fore,back,sink,asym=a+(b-a)*u;arr=ref.copy();arr[:,1]-=sink
   def pivot(ids,j,angle):
    rot=rx(angle);org=arr[j,:3].copy();arr[ids,:3]=rot.apply(arr[ids,:3]-org)+org;arr[ids,3:]=(rot*R.from_quat(arr[ids,3:])).as_quat()
   pivot(list(range(3,54)),ix['Hips'],back)
   for side,sg in [('L',1),('R',-1)]:
    u,l,e=[ix[n+side] for n in ['UpperLeg','LowerLeg','Foot']];toe=e+1;upper=th+asym*sg;lower=sh+.56*asym*sg;pivot([u,l,e,toe],u,upper);pivot([l,e,toe],l,lower-upper);pivot([e,toe],e,shoe-lower)
    a1,a2,w=[ix[n+side] for n in ['UpperArm','LowerArm','Wrist']];fingers=list(range(w+1,31 if sg==1 else 54));a0=arm-asym*.77*sg;b0=fore-asym*.67*sg;pivot([a1,a2,w]+fingers,a1,a0-back);pivot([a2,w]+fingers,a2,b0-a0)
   poses.append(np.round(arr.ravel(),6).tolist())
  d['clips'][name]={'src':'Atlas authored: '+name,'seconds':1 if name!='field-absorb' else .38,'loop':False,'poses':poses}
 f.write_bytes(gzip.compress(json.dumps(d,separators=(',',':'),ensure_ascii=False).encode(),mtime=0));print(style,f.stat().st_size)
