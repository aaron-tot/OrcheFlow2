import { Plugin } from "../../plugins/services"
import { Share } from "../../../infrastructure/cloud/share/share"
import { Format } from "../../../shared/utils/format"
// import { LSP } from "../../cli/infrastructure/lsp" // CLI-only, not in backend
import { FileWatcher } from "../../files/services/watcher"
import { File } from "../../files/services"
import { Project } from "./project"
import { Bus } from "../../../core/bus"
// import { Command } from "../../cli/services/command" // CLI-only, not in backend
import { Instance } from "../../../core/instance"
import { Vcs } from "./vcs"
import { Log } from "../../../shared/utils/log"
import { ShareNext } from "../../../infrastructure/cloud/share/share-next"
import { Snapshot } from "../../../infrastructure/cloud/snapshot"
import { Truncate } from "../../tools/services/truncation"

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })
  await Plugin.init()
  Share.init()
  ShareNext.init()
  Format.init()
  // await LSP.init() // CLI-only
  FileWatcher.init()
  File.init()
  Vcs.init()
  Snapshot.init()
  Truncate.init()

  // CLI-only: Command execution events
  // Bus.subscribe(Command.Event.Executed, async (payload) => {
  //   if (payload.properties.name === Command.Default.INIT) {
  //     await Project.setInitialized(Instance.project.id)
  //   }
  // })
}



