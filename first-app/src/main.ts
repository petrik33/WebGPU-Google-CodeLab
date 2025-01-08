
import wgslVertexSource from './vertex.wgsl?raw';
import wgslFragmetSource from './fragment.wgsl?raw';


const GRID_WIDTH = 32;
const GRID_HEIGHT = 32;
const CANVAS_COLOR = [0.1, 0.3, 0.4, 1];

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

const cellVertexShaderModule = device.createShaderModule({
  label: "Cell Vertex Shader",
  code: wgslVertexSource
})

const cellFragmentShaderModule = device.createShaderModule({
  label: "Cell Fragment Shader",
  code: wgslFragmetSource,
});

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: "auto",
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

const bindGroup = device.createBindGroup({
  label: "Cell renderer bind group",
  layout: cellPipeline.getBindGroupLayout(0),
  entries: [{
    binding: 0,
    resource: { buffer: uniformBuffer }
  }],
});

const encoder = device.createCommandEncoder();

const pass = encoder.beginRenderPass({
  colorAttachments: [{
    view: context.getCurrentTexture().createView(),
    loadOp: "clear",
    clearValue: CANVAS_COLOR,
    storeOp: "store",
  }]
});

pass.setPipeline(cellPipeline);
pass.setVertexBuffer(0, vertexBuffer);

pass.setBindGroup(0, bindGroup);

pass.draw(vertices.length / 2, GRID_WIDTH * GRID_HEIGHT);

pass.end();

// Finish the command buffer and immediately submit it.
device.queue.submit([encoder.finish()]);


