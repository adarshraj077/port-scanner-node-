#!/usr/bin/env node 
import net, { Socket } from "net";
import { exec } from "child_process";
import { promisify } from "util";
import getServiceName from './commonports.js'
import tls from 'tls'  


const target = process.argv[2]
const start_port = Number(process.argv[3]) ||1
const end_port = Number(process.argv[4]) || 8000
const os=process.argv[5]
const batch_size = 150

const green = (text) => `\x1b[32m${text}\x1b[0m`


//validating the arguments 
if (!target || !start_port || !end_port) {
  console.log("invalid arguments ")
  process.exit(1)
}

if (start_port < 1 || end_port > 65535 || start_port > end_port) {
  console.log("invalid ports : provide valid ports ")
  process.exit(1)
}

//basic services on common ports 
const execAsync =promisify(exec)
// scanning one single port 
async function getRTTping(host) {
  try{const { stdout } = await execAsync(`ping -c 4 ${host} | tail -1 | awk -F '/' '{print $5}'`)
  return Number(stdout.trim()) || 100
  } catch {
    return 100
  }
}



// doing banner grabbing 
const rttTarget=isNetwork_scan(target)?target.replace('0/24', '1'):target
 const avgRTT=await getRTTping(rttTarget)


 
function scanPort(port, host,timeout=Math.min(avgRTT*8,1000)) {
 
   return  new Promise((resolve, reject) => {
     const socket =  new net.Socket()
     socket.setTimeout(timeout)
   socket.connect(port, host, () => {
       socket.destroy()
      resolve({port,status:"open"})
     })

     socket.on("error", (err) =>{
       socket.destroy()
       switch (err.code) {
          case "ECONNREFUSED":  resolve({ port, status: "closed" });   break; // RST received
          case "EHOSTUNREACH":  resolve({ port, status: "filtered" }); break; // ICMP unreachable
          case "ENETUNREACH":   resolve({ port, status: "filtered" }); break; // ICMP net unreachable
          case "ECONNRESET":    resolve({ port, status: "closed" });   break; // RST mid-connect
          case "ETIMEDOUT":     resolve({ port, status: "filtered" }); break; // ambiguous
          default:              resolve({ port, status: "unknown" });  break;
        }})

     socket.on("timeout", () =>{
       socket.destroy()
       resolve({port,status:"no-response"})
       })  
   
   })
}


async function ping(host) {
 try{ await execAsync(`ping -c 1 -W 1 ${host} `)
   return true}
 catch {
   return false;
 }
}


async function scan_range(host) {
 
const open_ports = []
  const filtered_ports=[]

  for (let port = start_port; port <= end_port; port += batch_size){
    process.stdout.write(`\r\x1b[K  scanning ${host} : port ${port}–${Math.min(port + batch_size - 1, end_port)}`)

    const batch = []

    for (let current = port; current < port + batch_size && current <= end_port; current++){
      batch.push(scanPort(current, host))     
    }
     
    const results = await Promise.all(batch)

    for (const result of results)
    {
      if (result.status == "open") {
      // console.log(`[${green(result.status)}] ${getServiceName([Number(result.port)])} \n`)
        open_ports.push(result.port)
        
    }
      if (result.status == "filtered") {
        //if filtered retrying once more then marking it filtered 
        const retry = await scanPort(result.port, host, Math.min(avgRTT*8,1000) * 1.5);
        if (retry.status == 'filtered') {
           filtered_ports.push(result.port)
        }
        if (retry.status == "open") {
        // console.log(`${retry.port} :${retry.status} \n`)
        open_ports.push(retry.port)
        }
        
      }
    }
    
  }

  

  process.stdout.write('\r\x1b[K')
  if (open_ports.length === 0) return  

  console.log(`\n┌─ ${host}`)
  for (const port of open_ports) {
     console.log(`│  [${green('open')}] ${getServiceName(port)}`)
  }
  if (filtered_ports.length > 0) {
     console.log(`│  [filtered] ${filtered_ports.length} ports`)
  }
   console.log(`└─ ${open_ports.length} open port(s)\n`)
}

function isNetwork_scan(ip) {
  ip.split('.')
  const splitted = ip.split('.')
  if (splitted[3] == '0/24') { return true } else return false;
}
// console.log(await getBanner(Number(open_ports[2]), target))
async function handelNetworkScan(host) {
  const splitted = host.split('.')
  
  const pack_size=30
  
  for (let i = 1; i <= 254; i += pack_size){
    const batch = []
    for (let curr = i; curr < i + pack_size && curr <= 254; curr++){
      const hostCopy = [...splitted]
      hostCopy[3] = String(curr)
      const ip = hostCopy.join('.') 
      batch.push(
        ping(ip).then(async alive => {
          
          if (alive) {
            if (os && os === '-O') {
                         const result = await detect_os(ip)
                         if (result) console.log(`${ip} → ${result.os}`)
                       }
            return scan_range(ip)
          }
             })
           ) 
    }
     await Promise.all(batch)   
  }

}


async function detect_os(host) {
  const { stdout } = await execAsync(`ping -c 1 -W 1 ${host} | sed -n '2p'`,{ shell: true })
  const match = stdout.match(/ttl=(\d+)/i)
  if (!match) return null
  const ttl = Number(match[1])
  if (ttl <= 64)  return { os: 'Linux / Android / macOS'};
   if (ttl <= 128) return { os: 'Windows'};
   if (ttl <= 255) return { os: 'Cisco / FreeBSD / Solaris'};

}



if (isNetwork_scan(target)) {
  await handelNetworkScan(target)
} else {
  if (await ping(target)) {
    if (os&&os==='-O') {
      let result = await detect_os(target)
      if (result) console.log(result.os)
    }
    await scan_range(target)
  } else {
    console.log('host not rech');
    process.exit(1)
  }
  
}