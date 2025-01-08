
import wgslVertexSource from './vertex.wgsl?raw';
import wgslFragmetSource from './fragment.wgsl?raw';
import wgslSimulationSource from './simulation.wgsl?raw';


const GRID_WIDTH = 32;
const GRID_HEIGHT = 32;
const CANVAS_COLOR = [0.1, 0.3, 0.4, 1];
const UPDATE_INTERVAL = 100;

let step = 0;

const canvas = document.getElementById("project-canvas") as HTMLCanvasElement

if (!navigator.gpu) {
  throw new Error("WebGPU not supported on this browser.");
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice();
if (!device) {
  throw new Error("No appropriate GPUDevice found.");
}

const context = canvas.getContext("webgpu")!;
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: device,
  format: canvasFormat
});

const vertices = new Float32Array([
  //   X,    Y,
  -0.8, -0.8, // Triangle 1 (Blue)
  0.8, -0.8,
  0.8, 0.8,

  -0.8, -0.8, // Triangle 2 (Red)
  0.8, 0.8,
  -0.8, 0.8,
]);

const vertexBuffer = device.createBuffer({
  label: "Cell vertices",
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

const vertexBufferLayout: GPUVertexBufferLayout = {
  arrayStride: 8,
  attributes: [{
    format: "float32x2",
    offset: 0,
    shaderLocation: 0,
  }],
};

device.queue.writeBuffer(vertexBuffer, 0, vertices);

// Create a uniform buffer that describes the grid.
const uniformArray = new Float32Array([GRID_WIDTH, GRID_HEIGHT]);
const uniformBuffer = device.createBuffer({
  label: "Grid Uniforms",
  size: uniformArray.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

const cellStateArray = new Uint32Array(GRID_WIDTH * GRID_HEIGHT);

const cellStateStorage = [
  device.createBuffer({
    label: "Cell State A",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
  device.createBuffer({
    label: "Cell State B",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
];

const generateStartingState = () => {
  for (let i = 0; i < cellStateArray.length; ++i) {
    cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
  }
}


// UNCOMMENT AND COMMENT OUT THE PREVIOUS IMPL TO SEE THE GLIDERS
//
// const generateStartingState = () => {
//   // Initialize the entire grid to 0 (dead cells)
//   for (let i = 0; i < cellStateArray.length; ++i) {
//     cellStateArray[i] = 0;
//   }

//   // Function to set a cell to alive (1)
//   const setCell = (x: number, y: number) => {
//     if (x >= 0 && x < 32 && y >= 0 && y < 32) {
//       cellStateArray[y * 32 + x] = 1;
//     }
//   };

//   // Function to place a glider at a specific position
//   const placeGlider = (startX: number, startY: number) => {
//     setCell(startX + 1, startY);
//     setCell(startX + 2, startY + 1);
//     setCell(startX, startY + 2);
//     setCell(startX + 1, startY + 2);
//     setCell(startX + 2, startY + 2);
//   };

//   // Place multiple gliders on the grid
//   placeGlider(0, 0);  // Top-left corner
//   placeGlider(10, 10); // Somewhere in the middle
//   placeGlider(20, 20); // Another position
//   placeGlider(5, 25);  // Near the bottom-left corner
// };

generateStartingState();
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

const bindGroupLayout = device.createBindGroupLayout({
  label: "Cell Bind Group Layout",
  entries: [{
    binding: 0,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
    buffer: {} // Grid uniform buffer
  }, {
    binding: 1,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
    buffer: { type: "read-only-storage" } // Cell state input buffer
  }, {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "storage" } // Cell state output buffer
  }]
});

const bindGroups = [
  device.createBindGroup({
    label: "Cell renderer bind group A",
    layout: bindGroupLayout, // Updated Line
    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer }
    }, {
      binding: 1,
      resource: { buffer: cellStateStorage[0] }
    }, {
      binding: 2,
      resource: { buffer: cellStateStorage[1] }
    }],
  }),
  device.createBindGroup({
    label: "Cell renderer bind group B",
    layout: bindGroupLayout, // Updated Line

    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer }
    }, {
      binding: 1,
      resource: { buffer: cellStateStorage[1] }
    }, {
      binding: 2,
      resource: { buffer: cellStateStorage[0] }
    }],
  }),
];

const pipelineLayout = device.createPipelineLayout({
  label: "Cell Pipeline Layout",
  bindGroupLayouts: [bindGroupLayout],
});

const cellVertexShaderModule = device.createShaderModule({
  label: "Cell Vertex Shader",
  code: wgslVertexSource
})

const cellFragmentShaderModule = device.createShaderModule({
  label: "Cell Fragment Shader",
  code: wgslFragmetSource,
});

const simulationShaderModule = device.createShaderModule({
  label: "Game of Life simulation shader",
  code: wgslSimulationSource
});

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: pipelineLayout,
  vertex: {
    module: cellVertexShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout]
  },
  fragment: {
    module: cellFragmentShaderModule,
    entryPoint: "fragmentMain",
    targets: [{
      format: canvasFormat
    }]
  }
});

const simulationPipeline = device.createComputePipeline({
  label: "Simulation pipeline",
  layout: pipelineLayout,
  compute: {
    module: simulationShaderModule,
    entryPoint: "computeMain",
  }
});

let update = () => {
  const encoder = device.createCommandEncoder();

  const computePass = encoder.beginComputePass();

  computePass.setPipeline(simulationPipeline);
  computePass.setBindGroup(0, bindGroups[step % 2]);


  const workgroupCountX = Math.ceil(GRID_WIDTH / 8);
  const workgroupCountY = Math.ceil(GRID_HEIGHT / 8);
  computePass.dispatchWorkgroups(workgroupCountX, workgroupCountY);

  computePass.end();

  ++step;

  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: CANVAS_COLOR,
      storeOp: "store",
    }]
  });

  pass.setPipeline(cellPipeline);
  pass.setBindGroup(0, bindGroups[step % 2]);
  pass.setVertexBuffer(0, vertexBuffer);

  pass.draw(vertices.length / 2, GRID_WIDTH * GRID_HEIGHT);

  pass.end();

  device.queue.submit([encoder.finish()]);
}

setInterval(update, UPDATE_INTERVAL);


