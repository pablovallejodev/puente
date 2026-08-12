/**
 * onnxruntime-react-native and react-native-sherpa-onnx both ship
 * libonnxruntime.so. pickFirst alone is not enough: merge can keep Sherpa's
 * ORT (VERS_1.25.0) while Microsoft JSI needs VERS_1.28.0 → cold-start
 * UnsatisfiedLinkError on OrtGetApiBase.
 *
 * Ceiling: two ORT vendors with mismatched ELF symbol versions.
 * Upgrade path: one vendor, or rebuild Sherpa against Microsoft ORT.
 *
 * Also keeps local-machine knobs so mergeDexRelease does not OOM on 16 GB hosts.
 */
const { withAppBuildGradle, withGradleProperties, createRunOncePlugin } = require('expo/config-plugins');

const PICK_FIRST_KEY = 'android.packagingOptions.pickFirsts';
const PICK_FIRST_ENTRY = '**/libonnxruntime.so';
const SNIPPET_MARKER = '// @generated begin puente-ort-sherpa-packaging';
const SNIPPET_END = '// @generated end puente-ort-sherpa-packaging';

const PROPS = [
  [PICK_FIRST_KEY, PICK_FIRST_ENTRY],
  ['org.gradle.jvmargs', '-Xmx4096m -XX:MaxMetaspaceSize=512m'],
  ['org.gradle.workers.max', '2'],
  ['org.gradle.parallel', 'false'],
  ['reactNativeArchitectures', 'arm64-v8a'],
];

function setProperty(modResults, key, value) {
  const existing = modResults.find((p) => p.type === 'property' && p.key === key);
  if (existing) {
    if (key === PICK_FIRST_KEY) {
      const parts = String(existing.value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!parts.includes(PICK_FIRST_ENTRY)) {
        parts.push(PICK_FIRST_ENTRY);
        existing.value = parts.join(',');
      }
    } else {
      existing.value = value;
    }
  } else {
    modResults.push({ type: 'property', key, value });
  }
}

/** Injected into android/app/build.gradle — keep self-contained Groovy. */
const GRADLE_SNIPPET = `
${SNIPPET_MARKER}
// Force Microsoft libonnxruntime.so after merge; clear Sherpa OrtGetApiBase version.
// strip* must dependOn this fix — finalizedBy alone races with strip.
android.applicationVariants.configureEach { variant ->
    def cap = variant.name.substring(0, 1).toUpperCase() + variant.name.substring(1)
    def mergeName = "merge\${cap}NativeLibs"
    def stripName = "strip\${cap}DebugSymbols"
    def fixName = "fixOrtSherpa\${cap}NativeLibs"
    if (tasks.findByName(fixName) != null) return

    def fixTask = tasks.register(fixName) {
        description = "Replace Sherpa ORT with Microsoft ORT; clear Sherpa symbol versions"
        dependsOn mergeName
        doLast {
            def abi = "arm64-v8a"
            def mergeTask = tasks.named(mergeName).get()
            def libDirs = [] as Set
            mergeTask.outputs.files.each { out ->
                [new File(out, "lib/\${abi}"), new File(out, abi)].each { lib ->
                    if (lib.isDirectory()) libDirs << lib
                }
            }
            def fallback = new File(project.buildDir, "intermediates/merged_native_libs/\${variant.name}/merge\${cap}NativeLibs/out/lib/\${abi}")
            if (fallback.isDirectory()) libDirs << fallback

            if (libDirs.isEmpty()) {
                throw new GradleException("puente-ort-sherpa: no merged jni dir for \${variant.name}")
            }

            def microsoftOrt = findMicrosoftOrtSo(abi)
            def patchelf = resolvePatchelf()
            def sherpaConsumers = [
                "libsherpa-onnx-c-api.so",
                "libsherpa-onnx-jni.so",
                "libonnxruntime4j_jni.so",
            ]

            libDirs.each { libDir ->
                def dest = new File(libDir, "libonnxruntime.so")
                if (!dest.exists()) return
                ant.copy(file: microsoftOrt, tofile: dest, overwrite: true)
                logger.lifecycle("puente-ort-sherpa: replaced \${dest} (\${microsoftOrt.length()} bytes Microsoft ORT)")
                sherpaConsumers.each { name ->
                    def so = new File(libDir, name)
                    if (!so.exists()) return
                    def proc = ["\${patchelf}", "--clear-symbol-version", "OrtGetApiBase", so.absolutePath].execute()
                    proc.waitFor()
                    if (proc.exitValue() != 0) {
                        throw new GradleException(
                            "puente-ort-sherpa: patchelf failed on \${so}:\\n\${proc.err.text}\\n\${proc.in.text}"
                        )
                    }
                    logger.lifecycle("puente-ort-sherpa: cleared OrtGetApiBase version on \${so.name}")
                }
            }
        }
    }

    tasks.matching { it.name == stripName || it.name == "copy\${cap}JniLibsProjectOnly" }.configureEach {
        dependsOn fixTask
    }
    // Packaging without strip (some AGP paths) still waits.
    tasks.matching { it.name == "package\${cap}" || it.name == "merge\${cap}JavaResource" }.configureEach {
        mustRunAfter fixTask
    }
}

def findMicrosoftOrtSo(String abi) {
    def hits = []
    // Prefer extractLibs output under onnxruntime-react-native (cheap, local).
    def ortBuild = new File(rootProject.projectDir.parentFile, "node_modules/onnxruntime-react-native/android/build")
    if (ortBuild.isDirectory()) {
        fileTree(dir: ortBuild, include: "**/jni/\${abi}/libonnxruntime.so").each { hits << it }
    }
    if (hits.isEmpty()) {
        rootProject.allprojects.each { p ->
            if (!p.buildDir?.exists()) return
            fileTree(dir: p.buildDir, include: "**/jni/\${abi}/libonnxruntime.so").each { f ->
                def path = f.absolutePath
                if (path.contains("onnxruntime-android") || path.contains("microsoft")) {
                    hits << f
                }
            }
        }
    }
    // Avoid fileTree over all of ~/.gradle/caches (huge I/O). Probe known AGP transform layout only.
    if (hits.isEmpty()) {
        def caches = new File(gradle.gradleUserHomeDir, "caches")
        if (caches.isDirectory()) {
            caches.eachDir { versionCache ->
                def transforms = new File(versionCache, "transforms")
                if (!transforms.isDirectory()) return
                transforms.eachDir { hashDir ->
                    def so = new File(hashDir, "transformed/out/jni/\${abi}/libonnxruntime.so")
                    // Microsoft full ORT is ~28MB; Sherpa/xdcobra fork is ~21MB.
                    if (so.isFile() && so.length() >= 25_000_000L) hits << so
                }
            }
        }
    }
    if (hits.isEmpty()) {
        throw new GradleException(
            "puente-ort-sherpa: could not find Microsoft libonnxruntime.so for \${abi}. " +
            "Build onnxruntime-react-native once, or check Gradle caches."
        )
    }
    return hits.max { it.length() }
}

def resolvePatchelf() {
    def local = new File(rootProject.projectDir.parentFile, "scripts/bin/patchelf")
    if (local.canExecute()) return local.absolutePath
    def which = "which patchelf".execute()
    which.waitFor()
    if (which.exitValue() == 0) {
        def path = which.in.text.trim()
        if (path) return path
    }
    throw new GradleException(
        "puente-ort-sherpa: patchelf not found. Install it (sudo apt install patchelf) " +
        "or place an executable at scripts/bin/patchelf (NixOS patchelf 0.18+)."
    )
}
${SNIPPET_END}
`;

function withOrtSherpaPackaging(config) {
  config = withGradleProperties(config, (c) => {
    for (const [key, value] of PROPS) {
      setProperty(c.modResults, key, value);
    }
    return c;
  });

  config = withAppBuildGradle(config, (c) => {
    let contents = c.modResults.contents;
    if (contents.includes(SNIPPET_MARKER)) {
      const start = contents.indexOf(SNIPPET_MARKER);
      const end = contents.indexOf(SNIPPET_END);
      if (end !== -1) {
        contents = contents.slice(0, start) + GRADLE_SNIPPET.trimStart() + contents.slice(end + SNIPPET_END.length);
      }
    } else {
      contents = contents.trimEnd() + '\n' + GRADLE_SNIPPET;
    }
    c.modResults.contents = contents;
    return c;
  });

  return config;
}

module.exports = createRunOncePlugin(withOrtSherpaPackaging, 'with-ort-sherpa-packaging', '1.1.0');
