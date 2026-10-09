// The snapshot I have holds "0.2.0", so this is the next minor. If your file already holds a later version
// (E1/E2/E3 may have bumped it), use the next minor after that instead.
export const ASSESSMENT_ENGINE_VERSION = "0.3.0" as const;
// Update any test that asserts the literal (commit.test.ts asserted toBe("0.2.0")).