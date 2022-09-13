/**
 * penguins-eggs: pxe.ts
 * author: Piero Proietti
 * mail: piero.proietti@gmail.com
 */

// import {createHttpTerminator } from 'http-terminator'
  
import os from 'node:os'
import fs from 'fs'
import {Netmask} from 'netmask'
import Utils from '../classes/utils'
import Settings from '../classes/settings'

import http from 'http'
import { IncomingMessage, ServerResponse } from 'http'
import { exec } from '../lib/utils'
import path, { dirname } from 'node:path'
import Distro from './distro'

/**
* Pxe:
*/
export default class Pxe {
    verbose = false

    echo = {}
    settings = {} as Settings
    pxeRoot = ''
    isos: string[] = []
    iso = ''
    vmlinuz = ''
    initrd = ''

    /**
     * fertilization()
     */
    async fertilization() {
        this.settings = new Settings()
        await this.settings.load()
        if (Utils.isLive()) {
            this.iso = this.settings.distro.liveMediumPath
        } else {
            this.iso = path.dirname(this.settings.work_dir.path) + '/ovarium/iso/'
        }

        if (!Utils.isLive() && !fs.existsSync(this.settings.work_dir.path)) {
            console.log('no image available, build an image with: sudo eggs produce')
            process.exit()
        }

        /**
         * se pxeRoot non esiste viene creato
         */
        this.pxeRoot = path.dirname(this.settings.work_dir.path) + '/pxe/'
        if (!fs.existsSync(this.pxeRoot)){ 
            await exec(`mkdir ${this.pxeRoot} -p`)
        }


        /**
         * Ricerca delle immagini ISO
         */
        let isos: string[] = []
        if (!Utils.isLive()){
            let isos = fs.readdirSync(path.dirname(this.settings.work_dir.path))
            for (const iso of isos) {
                if (path.extname(iso) === ".iso") {
                    this.isos.push(iso)
                }
            }
        } else {
            this.isos.push(fs.readFileSync(`${this.iso}.disk/info`, 'utf-8'))
        }

        /**
         * installed: /home/eggs/ovarium/iso/live
         * live: this.iso/live
         */
        let pathFiles = this.iso + '/live'
        let files = fs.readdirSync(pathFiles)
        for (const file of files) {
            if (path.basename(file).substring(0, 7) === 'vmlinuz') {
                this.vmlinuz = path.basename(file)
            }
            if (path.basename(file).substring(0, 6) === 'initrd') {
                this.initrd = path.basename(file)
            }
        }
        
    }

    /**
     * structure
     */
    async structure() {

        if (fs.existsSync(this.pxeRoot)) {
            await this.tryCatch(`rm ${this.pxeRoot} -rf`)
        }
        let cmd = `mkdir -p ${this.pxeRoot}`
        await this.tryCatch(cmd)

        const distro = new Distro()

        await this.tryCatch(`mkdir ${this.pxeRoot} -p`)

        // boot  efi  isolinux  live .disk
        await this.tryCatch(`ln -s ${this.iso}boot ${this.pxeRoot}/boot`)
        await this.tryCatch(`ln -s ${this.iso}efi ${this.pxeRoot}/efi`)
        await this.tryCatch(`ln -s ${this.iso}isolinux ${this.pxeRoot}/isolinux`)
        await this.tryCatch(`ln -s ${this.iso}live ${this.pxeRoot}/live`)
        await this.tryCatch(`ln -s ${this.iso}.disk ${this.pxeRoot}/.disk`)

        // isolinux.theme.cfg, splash.png MUST to be on root
        await this.tryCatch(`ln -s ${this.iso}isolinux/isolinux.theme.cfg ${this.pxeRoot}/isolinux.theme.cfg`)
        await this.tryCatch(`ln -s ${this.iso}isolinux/splash.png ${this.pxeRoot}/splash.png`)

        // When http is not available, vmlinuz and initrd MUST to be on root
        await this.tryCatch(`ln ${this.iso}live/${this.vmlinuz} ${this.pxeRoot}/${this.vmlinuz}`)
        await this.tryCatch(`ln ${this.iso}live/${this.initrd} ${this.pxeRoot}/${this.initrd}`)

        // pxe
        await this.tryCatch(`ln ${distro.pxelinuxPath}pxelinux.0 ${this.pxeRoot}/pxelinux.0`)
        await this.tryCatch(`ln ${distro.pxelinuxPath}lpxelinux.0 ${this.pxeRoot}/lpxelinux.0`)

        // syslinux
        await this.tryCatch(`ln ${distro.syslinuxPath}ldlinux.c32 ${this.pxeRoot}/ldlinux.c32`)
        await this.tryCatch(`ln ${distro.syslinuxPath}vesamenu.c32 ${this.pxeRoot}/vesamenu.c32`)
        await this.tryCatch(`ln ${distro.syslinuxPath}libcom32.c32 ${this.pxeRoot}/libcom32.c32`)
        await this.tryCatch(`ln ${distro.syslinuxPath}libutil.c32 ${this.pxeRoot}/libutil.c32`)
        await this.tryCatch(`ln /usr/lib/syslinux/memdisk ${this.pxeRoot}/memdisk`)
        await this.tryCatch(`mkdir ${this.pxeRoot}/pxelinux.cfg`)

        // link iso images in pxe
        for (const iso of this.isos) {
            await this.tryCatch(`ln /home/eggs/${iso} ${this.pxeRoot}/${iso}`)
        }

        let content = ``
        content += `# eggs: pxelinux.cfg/default\n`
        content += `# search path for the c32 support libraries (libcom32, libutil etc.)\n`
        content += `path\n`
        content += `include isolinux.theme.cfg\n`
        content += `UI vesamenu.c32\n`
        content += `\n`
        content += `menu title Penguin's eggs - Perri's brewery edition - ${Utils.address()}\n`
        content += `PROMPT 0\n`
        content += `TIMEOUT 0\n`
        content += `\n`

        content += `MENU DEFAULT http\n`

        content += `LABEL tftp\n`
        content += `MENU LABEL tftp ${this.isos[0]}\n`
        content += `KERNEL ${this.vmlinuz}\n`
        content += `APPEND initrd=${this.initrd} boot=live config noswap noprompt fetch=http://${Utils.address()}/live/filesystem.squashfs\n`
        content += `SYSAPPEND 3\n`
        content += `\n`

        content += `LABEL http\n`
        content += `MENU LABEL http ${this.isos[0]}\n`
        content += `KERNEL http://${Utils.address()}/live/${this.vmlinuz}\n`
        content += `APPEND initrd=http://${Utils.address()}/live/${this.initrd} boot=live config noswap noprompt fetch=http://${Utils.address()}/live/filesystem.squashfs\n`
        content += `SYSAPPEND 3\n`
        content += `\n`

        content += `MENU SEPARATOR\n`
        for (const iso of this.isos) {
            content += `\n`
            content += `LABEL isos\n`
            content += `MENU LABEL ${iso} (memdisk)\n`
            content += `KERNEL memdisk\n`
            content += `APPEND iso initrd=http://${Utils.address()}/${iso}\n`
        }
        let file = `${this.pxeRoot}/pxelinux.cfg/default`
        fs.writeFileSync(file, content)

        file = `${this.pxeRoot}/index.html`
        content = ``
        content += `<html><title>Penguin's eggs PXE server</title>`
        content += `<div style="background-image:url('/splash.png');background-repeat:no-repeat;width: 640;height:480;padding:5px;border:1px solid black;">`
        content += `<h1>Penguin's eggs PXE server</h1>`
        content += `<body>address: <a href=http://${Utils.address()}>${Utils.address()}</a><br/>`
        if (!Utils.isLive()) {
            content += `download: <a href='http://${Utils.address()}/${this.isos[0]}'>${this.isos[0]}</a><br/>`
        } else {
            content += `started from live iso image<br/>`
        }
        content += `<br/>`
        content += `source: <a href='https://github.com/pieroproietti/penguins-eggs'>https://github.com/pieroproietti/penguins-eggs</a><br/>`
        content += `manual: <a href='https://penguins-eggs.net/book/italiano9.2.html'>italiano</a>, <a href='https://penguins--eggs-net.translate.goog/book/italiano9.2?_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en'>translated</a><br/>`
        content += `discuss: <a href='https://t.me/penguins_eggs'>Telegram group<br/></body</html>`
        fs.writeFileSync(file, content)

    }

    /**
     * 
     */
    async dnsMasq(full = false) {
        let domain = `penguins-eggs.lan`

        let n = new Netmask(`${Utils.address()}/${Utils.netmask()}`)

        let content = ``
        content += `# cuckoo.conf\n`
        content += `port=0\n`
        content += `interface=${await Utils.iface()}\n`
        content += `bind-interfaces\n`
        content += `domain=${domain}\n`
        content += `dhcp-no-override\n`
        content += `dhcp-option=option:router,${n.first}\n`
        content += `dhcp-option=option:dns-server,${n.first}\n`
        content += `dhcp-option=option:dns-server,8.8.8.8\n`
        content += `dhcp-option=option:dns-server,8.8.4.4\n`
        content += `enable-tftp\n`
        content += `tftp-root=${this.pxeRoot}\n`
        content += `# boot config for BIOS\n`
        content += `dhcp-match=set:bios-x86,option:client-arch,0\n`
        content += `dhcp-boot=tag:bios-x86,lpxelinux.0\n`
        content += `# boot config for UEFI\n`
        content += `dhcp-match=set:efi-x86_64,option:client-arch,7\n`
        content += `dhcp-match=set:efi-x86_64,option:client-arch,9\n`
        content += `dhcp-boot=tag:efi-x86_64,lpxelinux.0\n`
        /**
         * https://thekelleys.org.uk/dnsmasq/CHANGELOG
         * 
         * Don't do any PXE processing, even for clients with the 
         * correct vendorclass, unless at least one pxe-prompt or 
         * pxe-service option is given. This stops dnsmasq 
         * interfering with proxy PXE subsystems when it is just 
         * the DHCP server. Thanks to Spencer Clark for spotting this.
         */
        content += `pxe-service=X86PC,"penguin's eggs cuckoo",pxelinux.0\n`

        if (full) {
            content += `dhcp-range=${await Utils.iface()},${n.first},${n.last},${n.mask},8h\n`
        } else {
            content += `dhcp-range=${await Utils.iface()},${Utils.address()},proxy,${n.mask},${Utils.broadcast()} # dhcp proxy\n`
        }

        let file = '/etc/dnsmasq.d/cuckoo.conf'
        fs.writeFileSync(file, content)

        // console.log(content)

        await exec(`systemctl stop dnsmasq.service`)
        await exec(`systemctl start dnsmasq.service`)
    }

    /**
    * 
    * @param cmd 
    */
    async tryCatch(cmd = '') {
        try {
            await exec(cmd, this.echo)
        } catch (error) {
            console.log(`Error: ${error}`)
            await Utils.pressKeyToExit(cmd)
        }
    }

    /**
     * start http server for images
     * 
     * We have a limit of 2GB... bad!
     * 
     */
    async httpStart() {
        const port = 80
        const httpRoot = this.pxeRoot + "/"
        http.createServer(function (req: IncomingMessage, res: ServerResponse) {
            if (req.url === '/') {
                req.url = '/index.html'
            }

            fs.readFile(httpRoot + req.url, function (err, data) {
                if (err) {
                    res.writeHead(404)
                    res.end(JSON.stringify(err))
                    return
                }
                res.writeHead(200)
                res.end(data)
            });
        }).listen(80)
    }
}
