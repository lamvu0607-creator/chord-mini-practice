/**
 * Centralized yt-dlp execution runner & environment resolver
 * 
 * Provides robust, cross-platform resolution for yt-dlp and ffmpeg executables
 * without hardcoding local machine paths. Supports Conda environments,
 * virtualenvs, custom environment variables, and system PATH.
 */

import { spawn, SpawnOptions, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface YtDlpEnvironment {
  available: boolean;
  ytdlpExecutable: string;
  ffmpegDir: string | null;
  childEnv: NodeJS.ProcessEnv;
  resolvedFrom: string;
  error?: string;
}

let cachedEnv: YtDlpEnvironment | null = null;

/**
 * Resolve yt-dlp and ffmpeg paths dynamically across platforms and environments.
 */
export function getYtDlpEnvironment(forceRefresh = false): YtDlpEnvironment {
  if (cachedEnv && !forceRefresh) {
    return cachedEnv;
  }

  const isWin = process.platform === 'win32';
  const exeName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
  const ffmpegName = isWin ? 'ffmpeg.exe' : 'ffmpeg';
  const ffprobeName = isWin ? 'ffprobe.exe' : 'ffprobe';

  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  const condaEnvName = process.env.CONDA_ENV_NAME || 'chord-app';

  // 1. Collect candidate environment root directories
  const candidateRoots: string[] = [];

  // Active or base Conda prefix
  if (process.env.CONDA_PREFIX) {
    candidateRoots.push(process.env.CONDA_PREFIX);
    candidateRoots.push(path.join(process.env.CONDA_PREFIX, 'envs', condaEnvName));
  }

  // Standard user conda directories
  if (userHome) {
    candidateRoots.push(
      path.join(userHome, 'miniconda3', 'envs', condaEnvName),
      path.join(userHome, 'anaconda3', 'envs', condaEnvName),
      path.join(userHome, 'miniforge3', 'envs', condaEnvName),
      path.join(userHome, 'mambaforge', 'envs', condaEnvName),
      path.join(userHome, 'miniconda3'),
      path.join(userHome, 'anaconda3')
    );
  }

  // Project-local virtual environments
  candidateRoots.push(
    path.join(process.cwd(), 'venv'),
    path.join(process.cwd(), '.venv'),
    path.join(process.cwd(), '..', 'venv'),
    path.join(process.cwd(), '..', '.venv')
  );

  let ytdlpExecutable = 'yt-dlp';
  let ffmpegDir: string | null = null;
  const extraPaths: string[] = [];
  let resolvedFrom = 'system_path';

  // 2. Check explicit env variables first
  if (process.env.YTDLP_BINARY_PATH && fs.existsSync(process.env.YTDLP_BINARY_PATH)) {
    ytdlpExecutable = process.env.YTDLP_BINARY_PATH;
    extraPaths.push(path.dirname(ytdlpExecutable));
    resolvedFrom = 'YTDLP_BINARY_PATH';
  }

  if (process.env.FFMPEG_DIR && fs.existsSync(process.env.FFMPEG_DIR)) {
    ffmpegDir = process.env.FFMPEG_DIR;
    extraPaths.push(ffmpegDir);
  }

  // 3. Scan candidate roots for yt-dlp & ffmpeg
  let foundYtDlp = ytdlpExecutable !== 'yt-dlp';

  for (const root of candidateRoots) {
    if (!root || !fs.existsSync(root)) continue;

    // Check Scripts (Windows) or bin (Unix / macOS)
    const scriptDirs = isWin
      ? [path.join(root, 'Scripts'), root]
      : [path.join(root, 'bin'), root];

    for (const sDir of scriptDirs) {
      if (!fs.existsSync(sDir)) continue;

      const candidateExe = path.join(sDir, exeName);
      if (!foundYtDlp && fs.existsSync(candidateExe)) {
        ytdlpExecutable = candidateExe;
        foundYtDlp = true;
        extraPaths.push(sDir);
        resolvedFrom = candidateExe;
      }
    }

    // Check Library/bin (Windows conda) or bin (Unix) for ffmpeg & ffprobe
    const ffmpegCandidateDirs = isWin
      ? [path.join(root, 'Library', 'bin'), path.join(root, 'Scripts'), path.join(root, 'bin')]
      : [path.join(root, 'bin')];

    for (const fDir of ffmpegCandidateDirs) {
      if (!fs.existsSync(fDir)) continue;
      if (!ffmpegDir && fs.existsSync(path.join(fDir, ffmpegName)) && fs.existsSync(path.join(fDir, ffprobeName))) {
        ffmpegDir = fDir;
        extraPaths.push(fDir);
      }
    }
  }

  // 4. Fallback for ffmpeg from node_modules/ffmpeg-static if available
  if (!ffmpegDir) {
    const nodeModulesFfmpegDir = path.join(process.cwd(), 'node_modules', 'ffmpeg-static');
    const ffmpegExe = path.join(nodeModulesFfmpegDir, ffmpegName);
    const ffprobeExe = path.join(nodeModulesFfmpegDir, ffprobeName);
    if (fs.existsSync(ffmpegExe) && fs.existsSync(ffprobeExe)) {
      ffmpegDir = nodeModulesFfmpegDir;
      extraPaths.push(nodeModulesFfmpegDir);
    }
  }

  // 5. Construct child environment with updated PATH
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  if (ffmpegDir) {
    extraPaths.unshift(ffmpegDir);
  }

  // Remove duplicates
  const uniquePaths = Array.from(new Set(extraPaths.filter(Boolean)));
  if (uniquePaths.length > 0) {
    childEnv.PATH = `${uniquePaths.join(path.delimiter)}${path.delimiter}${childEnv.PATH || ''}`;
  }

  cachedEnv = {
    available: foundYtDlp,
    ytdlpExecutable,
    ffmpegDir,
    childEnv,
    resolvedFrom,
  };

  return cachedEnv;
}

/**
 * Spawn a yt-dlp child process with the resolved executable and environment
 */
export function spawnYtDlp(args: string[], options: SpawnOptions = {}): ChildProcessWithoutNullStreams {
  const envConfig = getYtDlpEnvironment();

  const spawnOptions: SpawnOptions = {
    ...options,
    env: {
      ...envConfig.childEnv,
      ...(options.env || {}),
    },
  };

  return spawn(envConfig.ytdlpExecutable, args, spawnOptions as never);
}

/**
 * Execute yt-dlp and return stdout, stderr, and exit code
 */
export async function runYtDlp(
  args: string[],
  options: { timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const { timeoutMs = 60000 } = options;

  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnYtDlp(args);
    } catch (err) {
      return reject(err);
    }

    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout | null = null;

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill();
        reject(new Error(`yt-dlp command timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}
