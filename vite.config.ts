import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  base:"./",
  server:{
    host: '0.0.0.0',
    allowedHosts: [
      '.ngrok-free.app',
    ],    
  },
  plugins:[
    viteStaticCopy({
      targets:[
        {
          src:"node_modules/three/examples/jsm/libs/basis",
          dest:"assets/libs",
        },
        {
          src:"node_modules/three/examples/jsm/libs/draco",
          dest:"assets/libs",
        },
      ],
    }),
  ]
});

