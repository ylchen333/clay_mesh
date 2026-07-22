import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm';

const $ = (s) => document.querySelector(s);
const canvas = $('#sceneCanvas');
const viewport = $('#viewport');
const statusText = $('#statusText');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
camera.position.set(0, .35, 5.2);
scene.add(new THREE.HemisphereLight(0xfff4e5, 0x302821, 2.1));
const key = new THREE.DirectionalLight(0xffe3c5, 3.8); key.position.set(-3, 4, 5); key.castShadow = true; scene.add(key);
const rim = new THREE.DirectionalLight(0xb5c8db, 2.1); rim.position.set(4, 1, -3); scene.add(rim);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 2.8; controls.maxDistance = 8;
const axes = new THREE.AxesHelper(1.25); axes.position.set(-1.85, -1.35, 0); scene.add(axes);
const grid = new THREE.GridHelper(6, 12, 0x514c45, 0x37332f); grid.position.y = -1.5; scene.add(grid);

const contactMaterial=new THREE.MeshBasicMaterial({color:0xf5e8d5,transparent:true,opacity:.9,side:THREE.DoubleSide,depthTest:true});
const contactRing=new THREE.Mesh(new THREE.RingGeometry(.78,1,48),contactMaterial);
const contactDot=new THREE.Mesh(new THREE.SphereGeometry(.045,16,10),new THREE.MeshBasicMaterial({color:0xffa16f,depthTest:true}));
const contactMarker=new THREE.Group();contactMarker.add(contactRing,contactDot);contactMarker.visible=false;contactMarker.renderOrder=8;scene.add(contactMarker);
const contactNormal=new THREE.Vector3(),zAxis=new THREE.Vector3(0,0,1);
function showContact(hit,state='hover'){
  if(!hit){contactMarker.visible=false;return;}
  contactMarker.visible=true;contactMarker.position.copy(hit.point);
  contactNormal.copy(hit.face.normal).transformDirection(mesh.matrixWorld).normalize();
  contactMarker.position.addScaledVector(contactNormal,.012);contactMarker.quaternion.setFromUnitVectors(zAxis,contactNormal);
  const brushRadius=Number($('#radius').value)/60;contactRing.scale.setScalar(brushRadius);contactDot.position.z=.012;
  const color=state==='active'?0xff8a55:state==='pull'?0x76d6ff:state==='blocked'?0xff4f4f:0xf5e8d5;
  contactMaterial.color.setHex(color);contactDot.material.color.setHex(color);contactMaterial.opacity=state==='hover'?.58:.95;
}

let mesh, baseGeometry, restPositions, currentShape = 'sphere', sculptMode = 'push', normalSurfaceVisible = false;
const clay = new THREE.MeshStandardMaterial({ color:0xc8754e, roughness:.72, metalness:.02, flatShading:false });
const normalSurface = new THREE.ShaderMaterial({
  vertexShader:`varying vec3 vNormal; void main(){vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`
    varying vec3 vNormal;
    vec3 hsv2rgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(0.0,0.6666667,0.3333333))*6.0-3.0);return c.z*mix(vec3(1.0),clamp(p-1.0,0.0,1.0),c.y);}
    void main(){vec3 n=normalize(vNormal);float hue=fract(atan(n.y,n.x)/6.2831853+0.5);float value=0.72+0.28*abs(n.z);gl_FragColor=vec4(hsv2rgb(vec3(hue,0.82,value)),1.0);}
  `,
  side:THREE.FrontSide
});
function geometryFor(shape) {
  const source=shape==='cube'?new THREE.BoxGeometry(2.15,2.15,2.15,28,28,28):new THREE.IcosahedronGeometry(1.35,5);
  // Face-specific UVs and normals prevent coincident boundary vertices from
  // welding. Sculpting an indexed, welded surface keeps every seam closed.
  source.deleteAttribute('uv');source.deleteAttribute('normal');
  const welded=mergeVertices(source,1e-5);source.dispose();welded.computeVertexNormals();
  if(!isClosedManifold(welded)) { welded.dispose();throw new Error('Primitive is not a closed two-manifold'); }
  return welded;
}
function isClosedManifold(geometry) {
  const index=geometry.index;if(!index||index.count%3!==0)return false;
  const edges=new Map(), a=index.array;
  for(let i=0;i<a.length;i+=3){
    const tri=[a[i],a[i+1],a[i+2]];
    if(tri[0]===tri[1]||tri[1]===tri[2]||tri[2]===tri[0])return false;
    for(let e=0;e<3;e++){const u=tri[e],v=tri[(e+1)%3],key=u<v?`${u}:${v}`:`${v}:${u}`;edges.set(key,(edges.get(key)||0)+1);}
  }
  for(const uses of edges.values())if(uses!==2)return false;
  return true;
}
function makeForm(shape) {
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
  contactMarker.visible=false;
  currentShape = shape; baseGeometry = geometryFor(shape); baseGeometry.computeVertexNormals();
  mesh = new THREE.Mesh(baseGeometry.clone(),normalSurfaceVisible?normalSurface:clay);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
  restPositions=mesh.geometry.attributes.position.array.slice();
  $('#vertexCount').textContent = `${mesh.geometry.attributes.position.count.toLocaleString()} vertices`;
}
makeForm('sphere');

function resize() {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport); resize();
function animate(time=0) { requestAnimationFrame(animate); controls.update();if(contactMarker.visible)contactDot.scale.setScalar(1+Math.sin(time*.008)*.18);renderer.render(scene, camera); }
animate();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function hitAt(x, y) {
  const r = canvas.getBoundingClientRect(); pointer.set(((x-r.left)/r.width)*2-1, -((y-r.top)/r.height)*2+1);
  raycaster.setFromCamera(pointer, camera); return raycaster.intersectObject(mesh, false)[0];
}
function sculpt(hit, pressure = 1, direction = sculptMode) {
  if (!hit) return false;
  const geo = mesh.geometry, pos = geo.attributes.position, normal = geo.attributes.normal;
  const before=pos.array.slice();
  const localHit = mesh.worldToLocal(hit.point.clone());
  const radius = Number($('#radius').value) / 60;
  const strength = Number($('#strength').value) / 100 * .045 * pressure * (direction === 'push' ? -1 : 1);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), rest = new THREE.Vector3(), delta = new THREE.Vector3();
  for (let i=0; i<pos.count; i++) {
    p.fromBufferAttribute(pos,i); const d=p.distanceTo(localHit); if(d>=radius) continue;
    n.fromBufferAttribute(normal,i).normalize(); const falloff=Math.pow(1-d/radius,2);
    p.addScaledVector(n,strength*falloff);
    // Keep every point inside a conservative envelope around the undeformed
    // form. This prevents repeated pushes from crossing the form's center.
    rest.fromArray(restPositions,i*3);delta.copy(p).sub(rest);
    const maxOffset=Math.max(rest.length()*.35,.18);if(delta.length()>maxOffset)p.copy(rest).add(delta.setLength(maxOffset));
    pos.setXYZ(i,p.x,p.y,p.z);
  }
  pos.needsUpdate=true;
  if(!hasSafeTriangles(geo,restPositions)){
    pos.array.set(before);pos.needsUpdate=true;geo.computeVertexNormals();return false;
  }
  geo.computeVertexNormals(); geo.computeBoundingSphere();return true;
}

function hasSafeTriangles(geometry,rest) {
  const index=geometry.index.array, now=geometry.attributes.position.array;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
  const ra=new THREE.Vector3(),rb=new THREE.Vector3(),rc=new THREE.Vector3(),rab=new THREE.Vector3(),rac=new THREE.Vector3();
  for(let i=0;i<index.length;i+=3){
    const ia=index[i],ib=index[i+1],ic=index[i+2];a.fromArray(now,ia*3);b.fromArray(now,ib*3);c.fromArray(now,ic*3);
    ra.fromArray(rest,ia*3);rb.fromArray(rest,ib*3);rc.fromArray(rest,ic*3);
    ab.subVectors(b,a);ac.subVectors(c,a);rab.subVectors(rb,ra);rac.subVectors(rc,ra);
    const currentNormal=ab.cross(ac),restNormal=rab.cross(rac),currentArea=currentNormal.length(),restArea=restNormal.length();
    if(currentArea<restArea*.12||currentNormal.dot(restNormal)<=currentArea*restArea*.12)return false;
  }
  return true;
}

let mouseSculpting=false;
canvas.addEventListener('pointerdown',e=>{ if(e.shiftKey){mouseSculpting=true;controls.enabled=false;const hit=hitAt(e.clientX,e.clientY),safe=sculpt(hit);showContact(hit,safe?'active':'blocked');} });
canvas.addEventListener('pointermove',e=>{ const c=$('#brushCursor'),hit=hitAt(e.clientX,e.clientY);if(e.shiftKey){c.style.display='block';c.style.left=`${e.clientX-viewport.getBoundingClientRect().left}px`;c.style.top=`${e.clientY-viewport.getBoundingClientRect().top}px`;}else c.style.display='none';if(mouseSculpting){const safe=sculpt(hit);showContact(hit,safe?'active':'blocked');}else showContact(hit,'hover'); });
canvas.addEventListener('pointerleave',()=>{if(!tracking)contactMarker.visible=false;});
window.addEventListener('pointerup',()=>{mouseSculpting=false;controls.enabled=true;});

document.querySelectorAll('.shape-button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.shape-button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',x===b)});makeForm(b.dataset.shape)}));
document.querySelectorAll('.mode-button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.mode-button').forEach(x=>x.classList.toggle('active',x===b));sculptMode=b.dataset.mode;}));
['strength','radius'].forEach(id=>$('#'+id).addEventListener('input',e=>$('#'+id+'Value').textContent=e.target.value+'%'));
$('#resetButton').addEventListener('click',()=>makeForm(currentShape));
$('#normalsButton').addEventListener('click',e=>{normalSurfaceVisible=!normalSurfaceVisible;mesh.material=normalSurfaceVisible?normalSurface:clay;e.currentTarget.classList.toggle('active',normalSurfaceVisible);e.currentTarget.setAttribute('aria-pressed',normalSurfaceVisible);e.currentTarget.textContent=normalSurfaceVisible?'Use clay material':'Show rainbow normals';});

function download(data,name,type) { const blob=data instanceof Blob?data:new Blob([data],{type}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
function exportReady(){
  if(!isClosedManifold(mesh.geometry)){statusText.textContent='Export blocked: mesh is not a closed manifold';return false;}
  if(!hasSafeTriangles(mesh.geometry,restPositions)){statusText.textContent='Export blocked: folded or degenerate triangles detected';return false;}
  return true;
}
$('#stlButton').addEventListener('click',()=>{if(exportReady())download(new STLExporter().parse(mesh,{binary:true}),'clay-mesh.stl','model/stl')});
$('#glbButton').addEventListener('click',()=>{if(exportReady()){const displayMaterial=mesh.material;mesh.material=clay;new GLTFExporter().parse(mesh,data=>{mesh.material=displayMaterial;download(data,'clay-mesh.glb','model/gltf-binary')},e=>{mesh.material=displayMaterial;console.error(e)},{binary:true,onlyVisible:true})}});

let handLandmarker, stream, tracking=false, lastVideoTime=-1, leftGesture=null;
const video=$('#webcam'), overlay=$('#handCanvas'), handCount=$('#handCount'), gestureReadout=$('#gestureReadout');
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
async function enableHands() {
  const cameraButton=$('#cameraButton');
  try {
    if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('SECURE_CONTEXT_REQUIRED');
    cameraButton.disabled=true;cameraButton.textContent='Starting camera…';statusText.textContent='Requesting camera access…';
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false});
    video.srcObject=stream;await video.play();video.classList.add('active');
    cameraButton.textContent='Loading model…';statusText.textContent='Loading hand model…';
    const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    const options={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minTrackingConfidence:.5};
    try { handLandmarker=await HandLandmarker.createFromOptions(vision,options); }
    catch(gpuError) { console.warn('MediaPipe GPU initialization failed; using CPU.',gpuError);options.baseOptions.delegate='CPU';handLandmarker=await HandLandmarker.createFromOptions(vision,options); }
    tracking=true;handCount.hidden=false;cameraButton.disabled=false;cameraButton.textContent='Disable camera';statusText.textContent='Hand tracking active';gestureReadout.classList.add('visible');requestAnimationFrame(trackHands);
  } catch(err){
    console.error('Unable to start hand tracking:',err);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;video.classList.remove('active');
    cameraButton.disabled=false;cameraButton.textContent='Try hand tracking again';
    if(err.message==='SECURE_CONTEXT_REQUIRED') statusText.textContent='Use HTTPS or localhost for camera access';
    else if(err.name==='NotAllowedError') statusText.textContent='Camera permission denied — allow it and retry';
    else if(err.name==='NotFoundError') statusText.textContent='No camera was found';
    else statusText.textContent=`Hand tracking failed: ${err.message||'model could not load'}`;
  }
}
function disableHands(){tracking=false;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;video.classList.remove('active');handCount.hidden=true;contactMarker.visible=false;overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height);$('#cameraButton').textContent='Enable hand tracking';statusText.textContent='Mouse mode ready';gestureReadout.classList.remove('visible');}
$('#cameraButton').addEventListener('click',()=>tracking?disableHands():enableHands());

const HAND_CONNECTIONS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
function drawHands(hands,roles=[]) {
  const rect=viewport.getBoundingClientRect(), dpr=Math.min(devicePixelRatio,2);
  overlay.width=Math.round(rect.width*dpr);overlay.height=Math.round(rect.height*dpr);
  const ctx=overlay.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,rect.width,rect.height);
  const videoRatio=video.videoWidth/video.videoHeight, viewRatio=rect.width/rect.height;
  const drawnW=viewRatio>videoRatio?rect.width:rect.height*videoRatio, drawnH=viewRatio>videoRatio?rect.width/videoRatio:rect.height;
  const ox=(rect.width-drawnW)/2, oy=(rect.height-drawnH)/2;
  const pt=p=>({x:ox+p.x*drawnW,y:oy+p.y*drawnH});
  hands.forEach((hand,handIndex)=>{
    const role=roles[handIndex],roleColor=role==='left'?'134,213,255':'255,152,104';
    ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=`rgba(${roleColor},.72)`;ctx.lineWidth=1.5;
    for(const [a,b] of HAND_CONNECTIONS){const p=pt(hand[a]),q=pt(hand[b]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
    const zs=hand.map(p=>p.z), near=Math.min(...zs), far=Math.max(...zs), span=Math.max(far-near,.001);
    hand.forEach((p,i)=>{const q=pt(p),depth=1-(p.z-near)/span,isTip=[4,8,12,16,20].includes(i);ctx.beginPath();ctx.arc(q.x,q.y,(isTip?5:2.5)+depth*(isTip?6:5),0,Math.PI*2);ctx.fillStyle=`rgba(${roleColor},${.55+depth*.45})`;ctx.shadowColor=`rgba(${roleColor},.85)`;ctx.shadowBlur=(isTip?7:0)+depth*10;ctx.fill();ctx.shadowBlur=0;if(i===8){ctx.strokeStyle='rgba(255,238,218,.9)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(q.x,q.y,12+depth*4,0,Math.PI*2);ctx.stroke();}});
  });
}
function applyTransformHand(hand) {
  const thumb=hand[4],index=hand[8],middle=hand[12];
  const scale=Math.max(dist(hand[5],hand[17]),.04), indexPinch=dist(thumb,index)/scale<.38, middlePinch=dist(thumb,middle)/scale<.38;
  const x=1-index.x,y=index.y;
  if(indexPinch){if(leftGesture?.type==='rotate'){mesh.rotation.y+=(x-leftGesture.x)*5;mesh.rotation.x+=(y-leftGesture.y)*4;}leftGesture={type:'rotate',x,y};return 'Left hand · rotating';}
  if(middlePinch){if(leftGesture?.type==='translate'){mesh.position.x+=(x-leftGesture.x)*3.5;mesh.position.y-=(y-leftGesture.y)*3.5;}leftGesture={type:'translate',x,y};return 'Left hand · translating';}
  leftGesture=null;return 'Left hand · pinch to transform';
}
function applySculptHand(hand) {
    const thumb=hand[4],index=hand[8],palm=hand[0],x=1-index.x,y=index.y,depth=palm.z-index.z;
    const scale=Math.max(dist(hand[5],hand[17]),.04),isPulling=dist(thumb,index)/scale<.38,direction=isPulling?'pull':'push';
    const r=canvas.getBoundingClientRect(),hit=hitAt(r.left+x*r.width,r.top+y*r.height);let gesture;
    if(depth>.055){const safe=hit&&sculpt(hit,THREE.MathUtils.clamp((depth-.04)*9,.2,1.25),direction);showContact(hit,safe?(isPulling?'pull':'active'):'blocked');gesture=hit?(safe?(isPulling?'Pulling surface':'Pushing surface'):'Deformation limit reached'):'Point at the form';}
    else {showContact(hit,'hover');gesture=hit?`${isPulling?'Pull':'Push'} preview · move fingertip closer`:'Point at the form';}
    return `Right hand · ${gesture}`;
}
function physicalRoles(result){
  const handedness=result.handedness??result.handednesses??[];
  return result.landmarks.map((_,i)=>{const label=(handedness[i]?.[0]?.categoryName??handedness[i]?.[0]?.displayName??'').toLowerCase();return label==='left'||label==='right'?label:null;});
}
function trackHands(){if(!tracking)return;if(video.currentTime!==lastVideoTime){lastVideoTime=video.currentTime;const result=handLandmarker.detectForVideo(video,performance.now()),roles=physicalRoles(result);drawHands(result.landmarks,roles);handCount.textContent=result.landmarks.length?`${roles.includes('left')?'L transform ':''}${roles.includes('right')?'R sculpt':''}`.trim()||`${result.landmarks.length} hand${result.landmarks.length>1?'s':''}`:'Looking for hands…';const leftIndex=roles.indexOf('left'),rightIndex=roles.indexOf('right'),messages=[];if(leftIndex>=0)messages.push(applyTransformHand(result.landmarks[leftIndex]));else leftGesture=null;if(rightIndex>=0)messages.push(applySculptHand(result.landmarks[rightIndex]));else contactMarker.visible=false;gestureReadout.textContent=messages.join(' · ')||'Show both hands to begin';}requestAnimationFrame(trackHands);}
