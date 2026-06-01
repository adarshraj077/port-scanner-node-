import { exec } from "child_process";
import { promisify } from "util";
const execAsync =promisify(exec)
const { stdout } = await execAsync(`ping -c 1 google.com | sed -n '2p'`)
let splitted=stdout.split(' ')
console.log(splitted)
const ttl=splitted[1]
console.log(ttl)