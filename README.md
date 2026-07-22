# Clay Mesh

An in-browser tool for intuitive 3D asset creation using Three.js and MediaPipe hand tracking.

**Live site:** https://clay.loriechen.com/

The site deploys automatically to GitHub Pages when changes are pushed to `main`.

<!-- probably good for intuitive mesh manipulation, might result in abstract or unique looking assets -->

## basic workflow
1. start with basic watertight mesh (sphere, cube) w/o texture + webcam footage
2. run mediapipe for handtracking (only ever find 2 hands at once)
3. depth???? -> from mediapipe
4. detected hand touches (?) mesh to manipulate

## ui
- before export, set a orientation w/ help of a three.js axeshelper
- pinch thumb and index fingertips to rotate
- pinch thumb and middle fingertips to translate x and y axes



## docs used
https://mediapipe.readthedocs.io/en/latest/solutions/hands.html
mediapipe -> Tracked 3D hand landmarks are represented by dots in different shades, with the brighter ones denoting landmarks closer to the camera -> use this depth information to inform how hand points affect

https://threejs.org --> 3D asset export, rendering, manipulatoin
https://threejs.org/docs/#Object3D
https://threejs.org/docs/#RenderTarget3D
https://threejs.org/docs/pages/BoxGeometry.html -> also look at other geometries in three.js
https://threejs.org/docs/#AxesHelper
https://threejs.org/docs/#OBJExporter
https://threejs.org/docs/pages/PLYExporter.html
https://threejs.org/docs/pages/STLExporter.html
https://threejs.org/docs/pages/USDZExporter.html

examples three.js html:
https://github.com/mrdoob/three.js/blob/master/examples/webgl_geometry_teapot.html


## further dev
things to consider:
- adding a flat base for objects that shouldn't roll around? --> add a mesh plane and do a boolean NOT and correct
- mesh boolean operations to combine abstract shapes?
