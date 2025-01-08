struct FragInput {
  @location(0) cell: vec2f,
};

@fragment
fn fragmentMain(input: FragInput) -> @location(0) vec4f {
    return vec4f(input.cell, 1 - (input.cell.x * 0.5 + input.cell.y * 0.5), 1);
}