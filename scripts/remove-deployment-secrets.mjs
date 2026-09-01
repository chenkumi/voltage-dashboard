import { readdir, rm } from "node:fs/promises"
import path from "node:path"

const outputDirectory = path.resolve("dist")

async function removeDevVars(directory) {
  let entries

  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === "ENOENT") return
    throw error
  }

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        await removeDevVars(entryPath)
        return
      }

      if (entry.name === ".dev.vars" || entry.name.startsWith(".dev.vars.")) {
        await rm(entryPath, { force: true })
      }
    }),
  )
}

await removeDevVars(outputDirectory)
