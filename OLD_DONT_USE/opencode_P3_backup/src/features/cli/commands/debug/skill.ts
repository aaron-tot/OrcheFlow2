import { EOL } from "os"
import { Skill } from "../../../skills/services"
import { bootstrap } from "../../services/bootstrap"
import { cmd } from "../cmd"

export const SkillCommand = cmd({
  command: "skill",
  describe: "list all available skills",
  builder: (yargs) => yargs,
  async handler() {
    await bootstrap(process.cwd(), async () => {
      const skills = await Skill.all()
      process.stdout.write(JSON.stringify(skills, null, 2) + EOL)
    })
  },
})
