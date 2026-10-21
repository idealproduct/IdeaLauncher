import { getLoaderArtifactListFor, installFabric } from '@xmcl/installer';

export async function installFabricVersion(
  minecraftVersion: string,
  minecraftRoot: string,
  loaderVersion?: string,
  fetchOptions: Parameters<typeof installFabric>[0]['fetch'] = undefined,
): Promise<string> {
  let version = loaderVersion;
  if (!version) {
    const artifacts = await getLoaderArtifactListFor(minecraftVersion, { fetch: fetchOptions });
    version = (artifacts.find(item => item.loader.stable) ?? artifacts[0])?.loader.version;
  }
  if (!version) throw new Error(`Fabric does not support Minecraft ${minecraftVersion}`);

  // The intermediary version can be 0.0.0 and is not the Minecraft version.
  // Use Fabric's official profile for inheritance, libraries and launch arguments.
  return installFabric({ minecraft: minecraftRoot, minecraftVersion, version, fetch: fetchOptions });
}
