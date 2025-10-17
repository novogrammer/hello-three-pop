import Stats from "stats-gl";
import { getElementSize } from './dom_utils';
import './style.scss'

import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import { pass, normalView, output, mrt, screenUV, vec4, mix } from "three/tsl";
import { createFresnelColorNode } from "./tsl_utils/fresnel";


function querySelector<Type extends HTMLElement>(query:string):Type{
  const element = document.querySelector<Type>(query);
  if(!element){
    throw new Error(`element is null : ${query}`);
  }
  return element;
}

async function mainAsync(){
  const backgroundElement=querySelector<HTMLElement>(".p-background");

  const {width,height}=getElementSize(backgroundElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const camera = new THREE.PerspectiveCamera( 30, width / height, 0.1, 1000 );
  camera.position.set(10,10,10);
  camera.lookAt(0,0,0);

  {
    const ambientLight=new THREE.AmbientLight(0xffffff,2);
    scene.add(ambientLight);
  }
  let directionalLight:THREE.DirectionalLight;
  {
    directionalLight=new THREE.DirectionalLight(0xffffff,1);
    directionalLight.castShadow=true;
    directionalLight.shadow.camera.top=30;
    directionalLight.shadow.camera.bottom=-30;
    directionalLight.shadow.camera.left=-30;
    directionalLight.shadow.camera.right=30;
    directionalLight.shadow.bias = -0.001;
    directionalLight.shadow.normalBias = 0.01;
    
    directionalLight.position.set(5,10,5);
    scene.add(directionalLight);
  }



  const renderer = new THREE.WebGPURenderer({
    antialias:true,
    // forceWebGL:true,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize( width, height );
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  await renderer.init();
  // const isWebGPUBackend = !!((renderer.backend as any)?.isWebGPUBackend);
  // if(!isWebGPUBackend){
  //   throw new Error("isWebGPUBackend is false");
  // }
  renderer.domElement.classList.add("p-background__canvas");
  backgroundElement.appendChild( renderer.domElement );
  const stats=new Stats({
    precision:3,
    trackHz: true,
    trackGPU: true,
    // trackCPT: true,
  });
  stats.init( renderer );
  stats.dom.style.top="0px";
  document.body.appendChild( stats.dom );

  const postProcessing = new THREE.PostProcessing( renderer );
  postProcessing.outputColorTransform = true;

  const controls = new OrbitControls( camera, renderer.domElement );
  // controls.listenToKeyEvents( window ); // optional
  controls.autoRotate = true;

  let box:THREE.Mesh;
  let boxBorder:LineSegments2;
  {
    const geometry = new THREE.BoxGeometry( 1, 1, 1 );
    const material = new THREE.MeshStandardNodeMaterial();
    box = new THREE.Mesh(geometry,material);
    box.position.y=4;
    box.castShadow=true;
    box.receiveShadow=true;
    scene.add(box);

    const edges = new THREE.EdgesGeometry( geometry, 10 );
    const lineSegmentsGeometry = new LineSegmentsGeometry();
    lineSegmentsGeometry.fromEdgesGeometry(edges);
    const matLine = new THREE.Line2NodeMaterial( {

      color: 0x4080ff,
      linewidth: 10, // in world units with size attenuation, pixels otherwise
      dashed: false,
      polygonOffset:true,
      polygonOffsetFactor:-10,
      polygonOffsetUnits:1,
    } );
    boxBorder = new LineSegments2( lineSegmentsGeometry, matLine );

    box.add(boxBorder);
  }
  {

    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath( 'assets/libs/draco/gltf/' );
    loader.setDRACOLoader(dracoLoader);

    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath( 'assets/libs/basis/' );
    ktx2Loader.detectSupport(renderer);
    loader.setKTX2Loader(ktx2Loader);
    // const gltf = await loader.loadAsync("assets/model/SceneMerged.glb");
    // const gltf = await loader.loadAsync("assets/model/SceneMerged-etc1s.glb");
    const gltf = await loader.loadAsync("assets/model/SceneMerged-etc1s-draco.glb");
    gltf.scene.traverse((object3d)=>{
      if(object3d instanceof THREE.Mesh){
        const mesh = object3d;
        {
          const materialSrc = mesh.material;
          if(materialSrc instanceof THREE.MeshStandardMaterial){
            const material = new THREE.MeshStandardNodeMaterial();
            material.color = materialSrc.color;
            material.roughness = materialSrc.roughness;
            material.metalness = materialSrc.metalness;
            const fresnelColor = createFresnelColorNode();
            material.outputNode = output.add(fresnelColor);
            mesh.material = material;
          }
        }
        mesh.castShadow=true;
        mesh.receiveShadow=true;
      }
    })
    scene.add(gltf.scene);

  }

  window.addEventListener("resize",()=>{
    const {width,height}=getElementSize(backgroundElement);
    renderer.setSize(width,height);
    renderer.setPixelRatio(window.devicePixelRatio);
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
    console.log("resized");

  })


  const scenePass = pass(scene,camera);
  // Capture both color (output) and view-space normals for edge detection.
  scenePass.setMRT( mrt( {
    output,
    normal: normalView
  } ) );
  const outputNode = scenePass.getTextureNode("output");

  const vignetteColor=vec4(0,0,0,1);
  const d = screenUV.sub(0.5).length();
  const vignetteDistance = (d.mul(1.4).pow(3));

  postProcessing.outputNode = mix(outputNode,vignetteColor,vignetteDistance);


  let isComputing=false;
  renderer.setAnimationLoop( animate );
  async function animate(){
    if(isComputing){
      console.log("skip");
      return;
    }
    isComputing=true;
    const time = performance.now() / 1000;
    controls.update(); // only required if controls.enableDamping = true, or if controls.autoRotate = true

    directionalLight.position.x=Math.sin(time) * 10;

    postProcessing.render();
    renderer.resolveTimestampsAsync( THREE.TimestampQuery.RENDER );
    stats.update();
    isComputing=false;
  }


}


mainAsync().catch(console.error);
