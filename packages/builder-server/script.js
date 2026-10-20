const path = require("path")
const fs = require("fs")
const { publishLog } = require("./lib/config")
const { closePublisher } = require("./lib/config")
const { cloneRepo } = require("./lib/git")
const { runBuild } = require("./lib/buildRunner")
const { uploadDist, uploadLambdaZip } = require("./lib/uploader")
const { updateDeploymentStatus } = require("./lib/deploymentStatus")
const { detectDeploymentType } = require("./lib/frameworkDetector")
const { buildWithOpenNext } = require("./lib/openNextBuilder")
const { packageLambda } = require("./lib/lambdaPackager")
const { deployLambda } = require("./lib/lambdaDeployer")

const PROJECT_ID = process.env.PROJECT_ID
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID
const REPO_URL = process.env.GIT_REPOSITORY__URL
const GIT_PAT_TOKEN = process.env.GIT_PAT_TOKEN
const GIT_BRANCH = process.env.GIT_BRANCH
const GIT_COMMIT_SHA = process.env.GIT_COMMIT_SHA
const OUTPUT_DIR = process.env.OUTPUT_DIR || "dist"

async function init() {
  console.log("Executing script")
  publishLog("Build Started...")
  publishLog(`Deployment: ${DEPLOYMENT_ID || "unknown"}`)
  await updateDeploymentStatus("BUILDING")

  const outDirPath = path.resolve(__dirname, "output")

  const commit = await cloneRepo(REPO_URL, GIT_PAT_TOKEN, outDirPath, {
    branch: GIT_BRANCH,
    commitSha: GIT_COMMIT_SHA,
  })
  // Tell the web app which commit this deployment is building.
  await updateDeploymentStatus("BUILDING", {
    commitSha: commit.sha,
    commitMessage: commit.message,
  })

  let detection = detectDeploymentType(outDirPath, {
    framework: process.env.FRAMEWORK,
    configuredOutputDir: OUTPUT_DIR,
  })
  publishLog(`Framework: ${process.env.FRAMEWORK || "not set"}`)
  publishLog(`Deployment type: ${detection.deploymentType}`)
  if (detection.deploymentType === "SSR") {
    publishLog("Next.js SSR detected — Lambda packaging will run after the build")
  }

  await runBuild(outDirPath, {
    installCommand: process.env.INSTALL_COMMAND,
    buildCommand: process.env.BUILD_COMMAND,
    envJson: process.env.BUILD_ENV_JSON,
  })

  publishLog("Build completed")

  if (detection.deploymentType === "STATIC") {
    const distFolderPath = path.resolve(outDirPath, detection.outputDir)
    if (!fs.existsSync(distFolderPath) && fs.existsSync(path.join(outDirPath, ".next"))) {
      publishLog(
        `Static output "${detection.outputDir}" was not produced; using the Next.js server output instead`
      )
      detection = { deploymentType: "SSR", outputDir: detection.outputDir }
    }
  }

  if (detection.deploymentType === "STATIC") {
    const distFolderPath = path.resolve(outDirPath, detection.outputDir)
    if (!distFolderPath.startsWith(outDirPath + path.sep)) {
      throw new Error(
        `Output directory "${detection.outputDir}" must be inside the repository`
      )
    }

    if (!fs.existsSync(distFolderPath)) {
      publishLog(`Error: output directory "${detection.outputDir}" not found`)
      const contents = fs.readdirSync(outDirPath)
      publishLog(`Repository root contains: ${contents.join(", ")}`)
      throw new Error(`Output directory "${detection.outputDir}" not found`)
    }

    const s3Path = await uploadDist(distFolderPath, PROJECT_ID, DEPLOYMENT_ID)
    await updateDeploymentStatus("READY", {
      s3Path,
      deploymentType: "STATIC",
    })
  } else {
    const openNext = await buildWithOpenNext(outDirPath)
    const s3Path = await uploadDist(openNext.assetsDir, PROJECT_ID, DEPLOYMENT_ID)
    const zipPath = await packageLambda(openNext.serverDir, DEPLOYMENT_ID)
    const lambdaKey = await uploadLambdaZip(zipPath, PROJECT_ID, DEPLOYMENT_ID)
    const lambda = await deployLambda({
      projectId: PROJECT_ID,
      deploymentId: DEPLOYMENT_ID,
      s3Bucket: process.env.LAMBDA_S3_BUCKET || process.env.AWS_BUCKET_NAME,
      s3Key: lambdaKey,
    })
    await updateDeploymentStatus("READY", {
      s3Path,
      deploymentType: "SSR",
      lambdaUrl: lambda.functionUrl,
      lambdaArn: lambda.functionArn,
    })
  }
}

init()
  .catch(async (err) => {
    publishLog(err.message || err)
    try {
      await updateDeploymentStatus("FAILED")
    } catch (callbackErr) {
      publishLog(callbackErr.message || callbackErr)
    }
    process.exitCode = 1
  })
  .finally(async () => {
    await closePublisher()
  })
