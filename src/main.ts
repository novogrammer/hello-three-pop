import Stats from "stats-gl";
import { getElementSize } from './dom_utils';
import './style.scss'

import * as THREE from "three/webgpu";

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
  const camera = new THREE.PerspectiveCamera( 30, width / height, 0.1, 1000 );
  camera.position.set(0,0,5);

  {
    const ambientLight=new THREE.AmbientLight(0xffffff,2);
    scene.add(ambientLight);
  }
  {
    const directionalLight=new THREE.DirectionalLight(0xffffff,1);
    directionalLight.position.set(10,10,10);
    scene.add(directionalLight);
  }



  const renderer = new THREE.WebGPURenderer({
    antialias:true,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize( width, height );
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


  const geometry = new THREE.BoxGeometry( 1, 1, 1 );
  const material = new THREE.MeshStandardNodeMaterial();
  const mesh = new THREE.Mesh(geometry,material);
  scene.add(mesh);



  let isComputing=false;
  renderer.setAnimationLoop( animate );
  async function animate(){
    if(isComputing){
      console.log("skip");
      return;
    }
    isComputing=true;


    await renderer.renderAsync( scene, camera );
    renderer.resolveTimestampsAsync( THREE.TimestampQuery.RENDER );
    stats.update();
    isComputing=false;
  }


}


mainAsync().catch(console.error);
