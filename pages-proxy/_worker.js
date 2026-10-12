// The custom-domain pass-through (docs/DEPLOYMENT.md, "Custom domains").
//
// Cloudflare only gives a Worker a custom domain when the domain's DNS is on Cloudflare; HKF's
// is at GoDaddy. A Pages project can take a subdomain through a plain CNAME at another DNS
// provider, so a Pages project per site (dev, production) owns the address and hands every
// request, WebSocket upgrades included, to the KSM Worker through a service binding. The Worker
// sees the request unchanged (method, path, headers, body), so nothing in it knows about Pages.
export default {
  fetch(request, env) {
    return env.KSM.fetch(request);
  },
};
