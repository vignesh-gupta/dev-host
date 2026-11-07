import express from "express"
import httpProxy from "http-proxy"

const PORT = process.env.PORT || 8000
const app = express()
const proxy = httpProxy.createProxy()
const s3BaseUrl = process.env.S3_BASE_URL
const proxyTimeout = Number(process.env.PROXY_TIMEOUT_MS || 30_000)

function isHttpResponse(
  value: unknown
): value is {
  headersSent: boolean
  writableEnded: boolean
  writeHead: (statusCode: number, headers: Record<string, string>) => void
  end: (body: string) => void
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "headersSent" in value &&
    "writableEnded" in value &&
    "writeHead" in value &&
    "end" in value
  )
}

proxy.on("error", (error, req, res) => {
  console.error("Preview upstream proxy failed:", error)
  if (!isHttpResponse(res)) return
  if (!res.headersSent) {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" })
  }
  if (!res.writableEnded) {
    res.end("Unable to reach the deployment")
  }
})

function lambdaProxyOptions(lambdaUrl: string) {
  const parsedLambdaUrl = new URL(lambdaUrl)
  const isLocalLambdaUrl =
    parsedLambdaUrl.hostname === "localhost" ||
    parsedLambdaUrl.hostname === "127.0.0.1" ||
    parsedLambdaUrl.hostname.endsWith(".localhost")

  if (!isLocalLambdaUrl) {
    return { target: lambdaUrl, changeOrigin: true, proxyTimeout }
  }

  const localEndpoint = new URL(
    process.env.LAMBDA_PROXY_ENDPOINT ||
      process.env.AWS_ENDPOINT_URL ||
      "http://localhost:4566"
  )
  localEndpoint.pathname = parsedLambdaUrl.pathname
  localEndpoint.search = parsedLambdaUrl.search

  return {
    target: localEndpoint.toString(),
    changeOrigin: false,
    headers: { host: parsedLambdaUrl.host },
    proxyTimeout,
  }
}

function isStaticAssetRequest(pathname: string) {
  if (pathname.startsWith("/_next/static/")) return true
  if (pathname === "/favicon.ico") return true

  return /\.(?:avif|css|gif|ico|jpeg|jpg|js|json|map|png|svg|txt|webmanifest|webp|woff2?)$/i.test(
    pathname
  )
}

function staticProxyOptions(
  projectId: string,
  deploymentId: string,
  requestUrl: URL
) {
  const objectPath = requestUrl.pathname.replace(/^\/+/, "")
  return {
    target: `${s3BaseUrl!.replace(/\/+$/, "")}/${projectId}/${deploymentId}/${objectPath}${requestUrl.search}`,
    changeOrigin: true,
    ignorePath: true,
    proxyTimeout,
  }
}

app.use(async (req, res) => {
  try {
    const subdomain = req.hostname.split(".")[0]

    if (!subdomain) {
      throw new Error("Missing subdomain in request hostname")
    }

    if (!s3BaseUrl) {
      throw new Error("S3_BASE_URL environment variable is not set")
    }

    const response = await fetch(
      "http://localhost:3000/api/rs/get-live?slug=" + subdomain
    )
    if (!response.ok) {
      throw new Error(`Base URL API returned ${response.status}`)
    }

    const project = await response.json()

    const {
      id: projectId,
      activeDeploymentId,
      deploymentType,
      lambdaUrl,
    } = project

    if (!projectId) {
      throw new Error(
        "The /rs/get-live response must contain a projectId field"
      )
    }
    if (deploymentType === "SSR") {
      if (!lambdaUrl) {
        throw new Error("SSR project is missing its Lambda Function URL")
      }

      const requestUrl = new URL(req.url, "http://preview.local")
      if (activeDeploymentId && isStaticAssetRequest(requestUrl.pathname)) {
        return proxy.web(
          req,
          res,
          staticProxyOptions(projectId, activeDeploymentId, requestUrl)
        )
      }

      const proxyOptions = lambdaProxyOptions(lambdaUrl)
      console.log({
        message: "Proxying SSR request",
        proxyOptions,
        lambdaUrl,
      })

      return proxy.web(req, res, proxyOptions)
    }

    if (!activeDeploymentId) {
      throw new Error("Static project is missing an active deployment")
    }
    const requestUrl = new URL(req.url, "http://preview.local")
    const objectPath =
      requestUrl.pathname === "/"
        ? "index.html"
        : requestUrl.pathname.replace(/^\/+/, "")
    const target = `${s3BaseUrl.replace(/\/+$/, "")}/${projectId}/${activeDeploymentId}/${objectPath}${requestUrl.search}`
    return proxy.web(req, res, {
      target,
      changeOrigin: true,
      ignorePath: true,
      proxyTimeout,
    })
  } catch (error) {
    console.error("Failed to resolve base URL:", error)
    return res.status(502).send("Unable to resolve the base URL")
  }
})

app.listen(PORT, () =>
  console.log(`Reverse Proxy Server is running on port ${PORT}`)
)
