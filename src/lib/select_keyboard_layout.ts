/**
 * penguins-eggs
 * selectKeyboardLayout
 * author: Piero Proietti
 */
 import inquirer from 'inquirer'
 import Keyboards from '../classes/keyboard'
 
 /**
  * 
  */
 export default async function selectKeyboardLayout(selected = ''): Promise<string> {
   const keyboards = new Keyboards()
   const supported = await keyboards.getLayouts()
 
   const questions: Array<Record<string, any>> = [
     {
       type: 'list',
       name: 'layout',
       message: 'Select layout: ',
       choices: supported,
       default: selected
     }
   ]
 
   return new Promise(function (resolve) {
     inquirer.prompt(questions).then(function (options) {
       resolve(options.layout)
     })
   })
 }
 
 