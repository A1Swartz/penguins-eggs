import chalk from 'chalk'
import Utils from './utils'
import { IMaterial } from '../interfaces'
import { exec } from '../lib/utils'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import Pacman from './pacman'


/**
 * 
 */
export default class Tailor {
    private verbose = false
    private echo = {}
    private costume = ''
    private wardrobe = ''
    materials = {} as IMaterial

    constructor(wardrobe: string, costume: string, verbose = false) {
        this.costume = costume
        this.wardrobe = wardrobe
    }


    /**
     * 
     */
    async prepare(verbose = false) {
        this.verbose = verbose
        this.echo = Utils.setEcho(verbose)
        Utils.warning(`preparing ${this.costume}`)

        /**
         * check curl presence
         */
        if (!Pacman.packageIsInstalled('curl')) {
            Utils.pressKeyToExit('In this tailoring shop we use curl. sudo apt update | apt install curl')
            process.exit()
        }

        const tailorList = `${this.wardrobe}/${this.costume}/index.yml`

        if (fs.existsSync(tailorList)) {
            this.materials = yaml.load(fs.readFileSync(tailorList, 'utf-8')) as IMaterial
        } else {
            console.log('costume ' + chalk.cyan(this.costume) + ' not found in wardrobe: ' + chalk.green(this.wardrobe))
        }

        /**
         * Repositories
         */
        Utils.warning(`analyzing repositories`)

        /**
        * sources.list
        */
        let step = '/etc/apt/sources.list'
        Utils.warning(step)
        let components = ''

        if (this.materials.sequence.repositories.sourcesList.main) {
            components += ' main'
        }

        if (this.materials.sequence.repositories.sourcesList.contrib) {
            components += ' contrib'
        }

        if (this.materials.sequence.repositories.sourcesList.nonFree) {
            components += ' non-free'
        }
        console.log(`using: ${components}`)

        /**
         * sources.list.d
         */
        if (this.materials.sequence.repositories.sourcesListD[0] !== null) {
            step = `adding repositories to /etc/apt/sources.list.d`
            Utils.warning(step)
            this.materials.sequence.repositories.sourcesListD.forEach(async cmd => {
                try {
                    await exec(cmd, this.echo)
                } catch (error) {
                    await Utils.pressKeyToExit(JSON.stringify(error))
                }
            })
        }

        /**
         * apt-get update
         */
        step = `updating repositories`
        Utils.warning(step)
        if (this.materials.sequence.repositories.update) {
            if (!this.verbose) {
                console.log('wait for: ' + step)
            }
            await exec('apt-get update', Utils.setEcho(false))
        }

        /**
         * apt-get full-upgrade
         */
        step = `apt-get full-upgrade`
        Utils.warning(step)
        if (this.materials.sequence.repositories.fullUpgrade) {
            if (!this.verbose) {
                console.log('wait for: ' + step)
            }
            await exec('apt-get full-upgrade -y', Utils.setEcho(false))
        }

        /**
         * checking tools
         */
        if (this.materials.sequence.dependencies[0] !==  null) {
            let dependenciesString = ''
            this.materials.sequence.dependencies.forEach( dependence => {
                dependenciesString += `, ${dependence}` 
            })
            step = `to prepare costume ${this.costume} we need  dependencies: ${dependenciesString.substring(1)}`
            Utils.warning(step)
            let cmd = 'apt-get install -y '
            this.materials.sequence.dependencies.forEach( dependence => {
                cmd += ` ${dependence}`
            })
            if (await Utils.customConfirm(cmd)) {
                if (!this.verbose) {
                    console.log('wait for: ' + step)
                }
                await exec(cmd, this.echo)
            }
        }


        /**
         * apt-get install packages
         */
        if (this.materials.sequence.packages[0] !== null) {
            step = `installing packages`
            Utils.warning(step)
            let cmd = 'apt-get install -y '
            this.materials.sequence.packages.forEach(elem => {
                cmd += ` ${elem}`
            })
            if (await Utils.customConfirm(cmd)) {
                if (!this.verbose) {
                    console.log('wait for: ' + step)
                }
                await exec(cmd, this.echo)
            }
        }

        /**
        * apt-get install accessories
        */
         
        if (this.materials.sequence.noInstallRecommends[0] !== null) {
            step = `installing packages --no-install-recommends`
            Utils.warning(step)
            let cmd = 'apt-get install --no-install-recommends --no-install-suggest -y '
            this.materials.sequence.noInstallRecommends.forEach(elem => {
                cmd += ` ${elem}`
            })
            if (await Utils.customConfirm(cmd)) {
                if (!this.verbose) {
                    console.log('wait for: ' + step)
                }
                await exec(cmd, this.echo)
            }
        }

        /**
         * dpkg -i *.deb
         */
        if (this.materials.sequence.debs) {
            step = `installing local packages`
            Utils.warning(step)
            if (!this.verbose) {
                console.log('wait for: ' + step)
            }
            await exec(`dpkg -i ${this.wardrobe}\*.deb`)
        }

        /**
         * customizations/scripts
         */
        if (this.materials.sequence.customizations.scripts[0] !== null) {
            step = `customizations scripts`
            Utils.warning(step)
            if (!this.verbose) {
                console.log('wait for: ' + step)
            }
            this.materials.sequence.customizations.scripts.forEach(async script => {
                await exec(`${this.wardrobe}/${this.costume}/${script}`, Utils.setEcho(true))
            })
        }

        /**
         * customizations/skel
         */
         if (this.materials.sequence.customizations.skel) {
            step = `customizations skel`
            if (fs.existsSync(`${this.wardrobe}/skel`)) {
                Utils.warning(step)
                if (!this.verbose) {
                    console.log('wait for: ' + step)
                }
                await exec(`cp -r ${this.wardrobe}/skel /etc/`)
            } else {
                Utils.warning(`${this.wardrobe}/skel not found!`)
            }
        }

        /**
         * customizations/usr
         */
         if (this.materials.sequence.customizations.usr) {
            step = `customizations usr`
            if (fs.existsSync(`${this.wardrobe}/skel`)) {
                Utils.warning(step)
                if (!this.verbose) {
                    console.log('wait for: ' + step)
                }
                await exec(`cp -r ${this.wardrobe}/usr /usr`)
            } else {
                Utils.warning(`${this.wardrobe}/usr not found!`)
            }
        }

        /**
         * hostname and hosts
         */
        if (this.materials.sequence.hostname) {
            Utils.warning(`changing hostname = ${this.materials.name}`)
            await this.hostname()
        }

        /**
         * reboot
         */
        if (this.materials.sequence.reboot) {
            Utils.warning(`Reboot`)
            await Utils.pressKeyToExit('system need to reboot', true)
            await exec('reboot')
        }
    }


    /**
    * hostname and hosts
    */
    private async hostname() {

        /**
         * hostname
         */
        let file = '/etc/hostname'
        let text = this.materials.name
        await exec(`rm ${file} `, this.echo)
        fs.writeFileSync(file, text)

        /**
         * hosts
         */
        file = '/etc/hosts'
        text = ''
        text += '127.0.0.1 localhost localhost.localdomain\n'
        text += `127.0.1.1 ${this.materials.name} \n`
        text += `# The following lines are desirable for IPv6 capable hosts\n`
        text += `:: 1     ip6 - localhost ip6 - loopback\n`
        text += `fe00:: 0 ip6 - localnet\n`
        text += `ff00:: 0 ip6 - mcastprefix\n`
        text += `ff02:: 1 ip6 - allnodes\n`
        text += `ff02:: 2 ip6 - allrouters\n`
        text += `ff02:: 3 ip6 - allhosts\n`
        await exec(`rm ${file} `, this.echo)
        fs.writeFileSync(file, text)
    }
}