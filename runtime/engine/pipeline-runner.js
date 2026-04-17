export async function runPipeline({ context, pipeline, input = {} }) {
  let state = await context.stateStore.getOrCreate(input.initialState);
  for (const stage of pipeline.stages) {
    if (!stage.when(state, input)) continue;
    const result = await stage.run({ state, input, context });
    state = result?.state ?? (await context.stateStore.read());
    if (result?.stop) break;
  }
  return state;
}
