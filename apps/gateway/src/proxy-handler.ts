import type { RequestHandler } from "express";

export function createProxyHandler(targetUrl: string): RequestHandler {
  return async (req, res) => {
    const url = new URL(req.url, targetUrl);
    const options: RequestInit = {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: req.body,
    };
    const response = await fetch(url.toString(), options);
    res.status(response.status);
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.send(response.arrayBuffer());
  };
}
