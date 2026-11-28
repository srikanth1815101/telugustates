// Post-processing stack (Phase 3) over vendored `postprocessing` v6.
// Chain: RenderPass → Bloom → ACES tone map → SMAA. Everything is lazily
// imported (~620 kB) and only ever active on tier-2 devices with the saver
// off — or forced with ?fx=1 for verification. The default path never
// changes: if anything fails to build, the world falls back to a direct
// renderer.render().
// @ts-check
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from "../vendor/postprocessing.module.js";

/**
 * Build the composer around an existing WebGLRenderer/scene/camera.
 * @param {any} renderer @param {any} scene @param {any} camera
 */
export function createPostfx(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new BloomEffect({
    luminanceThreshold: 0.86,
    luminanceSmoothing: 0.2,
    intensity: 0.28,
    radius: 0.72,
  });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const smaa = new SMAAEffect();
  composer.addPass(new EffectPass(camera, bloom, tone, smaa));

  let w = 0,
    h = 0,
    bw = 0,
    bh = 0;
  return {
    /** Render one frame through the stack. */
    render(dt) {
      composer.render(dt);
      globalThis.__atlasFxDebug = {
        passes: composer.passes.length,
        buf: [bw, bh],
        size: [w, h],
        canvas: [renderer.domElement.width, renderer.domElement.height],
      };
    },
    /**
     * Follow the renderer without EVER calling composer.setSize — that
     * method forwards to renderer.setSize and, fed with drawing-buffer
     * pixels, cascades the canvas to 0×0. Resize the composer's own
     * buffers (raw pixels) and leave the canvas entirely alone.
     * @param {number} logicalW @param {number} logicalH CSS pixels
     * @param {number} bufW @param {number} bufH drawing-buffer pixels
     */
    syncSize(logicalW, logicalH, bufW, bufH) {
      if (logicalW === w && logicalH === h && bufW === bw && bufH === bh)
        return;
      w = logicalW;
      h = logicalH;
      if (bufW !== bw || bufH !== bh) {
        bw = bufW;
        bh = bufH;
        composer.inputBuffer.setSize(bw, bh);
        composer.outputBuffer.setSize(bw, bh);
        composer.depthRenderTarget?.setSize(bw, bh);
        for (const pass of composer.passes) pass.setSize(bw, bh);
      }
    },
    dispose() {
      composer.dispose?.();
    },
    passes: composer.passes.length,
  };
}
