export function getAgentInstallCommand(origin: string, token: string) {
  const base = origin.replace(/\/$/, "");
  return `curl -fsSL ${base}/scripts/install-litestats-agent.sh | sudo bash -s -- --token ${token} --base-url ${base}`;
}
