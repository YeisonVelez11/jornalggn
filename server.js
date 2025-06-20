const express = require('express');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const { google } = require('googleapis');
const streamifier = require('streamifier');
const moment = require('moment');
require('moment/locale/es'); // Cargar la localización en portugués

const fs = require('fs');
const puppeteer = require('puppeteer');

const puppeteerExtra = require('puppeteer-extra');
const Stealth = require('puppeteer-extra-plugin-stealth');

puppeteerExtra.use(Stealth());
//const apikeys = require('./credentials.json');
const { createCanvas, loadImage, registerFont } = require('canvas');
const locateChrome = require('locate-chrome');
const fsp = require('fs/promises');

// prod
const idCarpetaJsones = "119SphX2xlzS-dvWXkSecVOoXUD2ixDg1";
const idCarpetaRaiz = '1Ru-QfXmOa2lH6DQOGi4YfgquRVTuCLZp';
const idCarpetaBanners = "1YXZGIjUfjl5m5aqk9hSEUVtplAS31lkg";
const fileJsonPasado = "13llXgiizllL8wRRIBupP_O9-W8uhwcla";


//prueba/*
/*const idCarpetaJsones = "1YXZ9RaTBwNh4-JJSBJBg4dsr2bIf1KQ0";
const idCarpetaRaiz = '1LFO6UvWfam7KJSVRfGKlijv8eRLYVoD1';
const idCarpetaBanners = "1rcCJ8bsaxd4VhTSA1TjiI1GEpFy_XJ6G";
const fileJsonPasado = "1QqKyXiOhFeqwAa5XlXvu9HYqmwkS77b6";*/

// Registrar la fuente
registerFont(path.join(__dirname, "public",'fonts', 'HelveticaNeue.ttf'), { family: 'Helvetica Neue' });
registerFont(path.join(__dirname, "public", 'fonts', 'SanFrancisco.ttf'), { family: 'San Francisco' });
const storageFilePath = path.join(__dirname, 'storage.txt');

async function getPreviousHref() {
    if (fs.existsSync(storageFilePath)) {
        return fs.readFileSync(storageFilePath, 'utf-8');
    }
    return null;
}
async function saveCurrentHref(href) {
    fs.writeFileSync(storageFilePath, href, 'utf-8');
}

function formatDateFromHref(href, datePast) {

    if(!datePast){
        console.log("aca");
        const months = {
            "janeiro": 1,
            "fevereiro": 2,
            "março": 3,
            "abril": 4,
            "maio": 5,
            "junho": 6,
            "julho": 7,
            "agosto": 8,
            "setembro": 9,
            "outubro": 10,
            "novembro": 11,
            "dezembro": 12
        };
    
        // Separar la cadena en partes
        const parts = href.split(' ');
    
        // Extraer el día, mes y año
        const day = parts[0]; // 23
        const monthText = parts[2]; // "outubro"
        const year = parts[4]; // 2024
    
        // Obtener el número del mes
        const monthNum = months[monthText.toLowerCase()];
        return  {
            day: day,
            month: monthNum,
            year: year
        }
    }

    const fechaMoment = moment(href, "MM/DD/YYYY");
    console.log(fechaMoment,href);
    // Extraer el día, el mes y el año
    const day = fechaMoment.date(); // Día del mes (1-31)
    const month = fechaMoment.month() + 1; // Mes en número (0-11), sumamos 1 para que sea (1-12)
    const year = fechaMoment.year(); // Año
    
    // Retornar el objeto JSON
    return {
        day: day,
        month: month,
        year: year
    };
}


const app = express();
const port = 3000;
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
require('dotenv').config(); // Cargar variables de entorno

async function authorize() {

    const jwtClient = new google.auth.JWT(
        process.env.GOOGLE_CLIENT_EMAIL,
        null,
        process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        ['https://www.googleapis.com/auth/drive']
    );

    await jwtClient.authorize();
    console.log('Successfully connected to Google Drive API.');
    return jwtClient;

}
let auth;
/*(async()=>{
    auth = await authorize();
    await obtenerJsonHrefPasados();
    agregarHrefJson();
})()*/

async function listFolders(auth, parentId) {
    const drive = google.drive({ version: 'v3', auth });
    const response = await drive.files.list({
        q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
    });
    return response.data.files;
}


async function findFileByName(auth, folderId, fileName) {
    const drive = google.drive({ version: 'v3', auth });
    const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
    
    const response = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
        pageSize: 1,
    });

    return response.data.files.length > 0 ? response.data.files[0] : null;
}

async function uploadBufferToDrive(auth, folderId, fileName, buffer, mimeType) {
    const drive = google.drive({ version: 'v3', auth });
    
    // Buscar el archivo existente por nombre en la carpeta especificada
    const existingFile = await findFileByName(auth, folderId, fileName);

    const media = {
        mimeType: mimeType,
        body: streamifier.createReadStream(buffer),
    };

    if (existingFile) {
        // Si existe, actualizamos el archivo
        const response = await drive.files.update({
            fileId: existingFile.id,
            media: media,
            fields: 'id',
        });
        return response.data.id; // ID del archivo actualizado
    } else {
        // Si no existe, creamos un nuevo archivo
        const fileMetadata = {
            name: fileName,
            parents: [folderId],
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',
        });
        return response.data.id; // ID del nuevo archivo creado
    }
}

async function uploadFileToDrive(auth, folderId, fileName, fileBuffer, mimeType) {
    const drive = google.drive({ version: 'v3', auth });
    const fileMetadata = {
        name: fileName,
        parents: [folderId],
    };

    const media = {
        mimeType: mimeType,
        body: streamifier.createReadStream(fileBuffer),
    };

    const existingFilesResponse = await drive.files.list({
        q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id)',
    });

    const existingFiles = existingFilesResponse.data.files;

    for (const file of existingFiles) {
        await drive.files.delete({
            fileId: file.id,
        });
    }

    const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id',
    });

    return response.data.id;
}

async function waitFor(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const device_celular = {
    width:355,
    height: (667 + 250)
}


// Función para procesar el archivo JSON
async function agregarHrefJson(hrefJson) {
    try {
        const drive = google.drive({ version: 'v3', auth });

        // 1. Obtener el archivo JSON
        const response = await drive.files.get({
            fileId: fileJsonPasado,
            alt: 'media'
        });

        // 2. Parsear el contenido a JSON
        let contenidoActual;
        if (typeof response.data === 'string') {
            contenidoActual = JSON.parse(response.data);
        } else {
            contenidoActual = response.data; // asumiendo que ya es un objeto
        }
        // 3. Verificar que el contenido sea un arreglo
        if (!Array.isArray(contenidoActual)) {
            console.error("El contenido del archivo JSON no es un arreglo.");
            return;
        }
        const hrefExistente = contenidoActual.some(item => item.fecha === hrefJson.fecha);

        if (hrefExistente) {
            console.log(`El href "${hrefJson}" ya existe. No se guardará nada.`);
            return; // Salir de la función si el nombre no es único
        }

        // 4. Agregar el nuevo registro al inicio del arreglo
        contenidoActual.unshift(hrefJson);

        // 5. Convertir de nuevo a JSON
        const jsonModificado = JSON.stringify(contenidoActual, null, 2);

        // 6. Subir el archivo modificado
        await drive.files.update({
            fileId: fileJsonPasado,
            media: {
                mimeType: 'application/json',
                body: jsonModificado,
            },
            fields: 'id'
        });

        console.log('Registro agregado exitosamente.');
    } catch (error) {
        console.error('Error al procesar el archivo JSON:', error.message);
    }
}
async function obtenerJsonHrefPasados() {
    try {
        const drive = google.drive({ version: 'v3', auth });

        // 1. Obtener el archivo JSON
        const response = await drive.files.get({
            fileId: fileJsonPasado,
            alt: 'media'
        });

        let contenidoActual;
        if (typeof response.data === 'string') {
            contenidoActual = JSON.parse(response.data);
        } else {
            contenidoActual = response.data; // asumiendo que ya es un objeto
        }

        // 3. Verificar que el contenido sea un arreglo
        if (!Array.isArray(contenidoActual)) {
            console.error("El contenido del archivo JSON no es un arreglo.");
            return [];
        }
        return contenidoActual;
    } catch (error) {
        console.error('Error al procesar el archivo JSON:', error.message);
    }
}


let intentos = 0;
let hayError = false;
let page;
let currentHref;
let currentDate;

async function newNotice(page){

    console.log("fecha actual", "https://jornalggn.com.br/");
    page.setDefaultNavigationTimeout(0);

    await page.goto('https://jornalggn.com.br/', { waitUntil: 'networkidle2' });
    await waitFor(10000);

    currentHref = await page.evaluate(() => {
        const element = document.querySelector('.featured--left article a');
        return element ? element.href : null;
    });
    currentDate = await page.evaluate(() => {
        const dateTextElement = document.querySelector('.featured--left .featured-post-content p span');
        console.log(dateTextElement.innerText);
        // Extraemos el texto y lo convertimos a un string
        const dateText = dateTextElement.innerText.trim();
        return dateText;
    });
    console.log(currentDate);
}

async function captureScreenshotAndUpload(folderId, auth, banner1Url, bannerLateralUrl, datePast, device) {
    currentHref = null;
    currentDate = null;
  

    //const browser = await puppeteer.launch({
    const browser = await puppeteerExtra.launch({
        args: [
          "--disable-setuid-sandbox",
          "--no-sandbox",
          "--single-process",
          "--no-zygote",
        ],
        headless: "true",
        executablePath:
          process.env.NODE_ENV === "production"
            ? process.env.PUPPETEER_EXECUTABLE_PATH
            : puppeteer.executablePath(),
      });
 


    const page = await browser.newPage();

    if(device === 'celular'){
        await page.setViewport({
            width: device_celular.width,
            height: device_celular.height,
            isMobile: true, // Esto simula un dispositivo móvil
            hasTouch: true, // Esto simula que el dispositivo tiene pantalla táctil
        });
    }
    else{
        
        await page.setViewport({ width: 1592, height: 900 });
    }
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    let fechaPagina;
    try {
        hayError = false;

        console.log("aqui");
        console.log("datePast",datePast);
     
        if(datePast){
            console.log("dias pasados");
            const formattedDate = moment(datePast, 'MM/DD/YYYY');
            console.log(formattedDate);
            let jsonData;
            try {
                // Lee el archivo JSON de manera asíncrona
                // const data = await fsp.readFile('./public/noticias.json', 'utf8');
                // Convierte el contenido a un objeto JSON
                //const elements = JSON.parse(data);
                    const elements = await obtenerJsonHrefPasados();
                    /*const isDateEqual = (fechaFormato, stringFechaPortugues) => {
                        // Convertir la fecha en formato MM/DD/YYYY a objeto moment
                        const fecha1 = moment(fechaFormato, "MM/DD/YYYY");
                        
                        // Extraer la fecha del string en portugués usando una expresión regular
                        const regex = /Publicado em (\d{1,2}) de (\w+) de (\d{4})/;
                        const match = stringFechaPortugues.match(regex);
                        
                        if (!match) {
                            throw new Error('No se pudo extraer la fecha del string proporcionado.');
                        }

                        const dia = match[1];
                        const mes = match[2];
                        const anio = match[3];

                        // Convertir el mes en nombre a número
                        const mesNumero = moment().locale('pt').month(mes).month();

                        // Crear objeto moment para la fecha extraída
                        const fecha2 = moment([anio, mesNumero, dia]);

                        // Comparar las dos fechas
                        return fecha1.isSame(fecha2, 'day');
                    };*/
    
    
    
                    
                    if(elements.length > 0){
                        for(let element of elements){
                            if (element && moment(element.fecha, 'MM/DD/YYYY').isSame(moment(formattedDate, 'MM/DD/YYYY'), 'day')) {
                                currentHref = element.href;
                                currentDate = element.fecha;
                                console.log("encontrada fecha");
                                break;
                            }  
                        }
                    }
                    if(!currentHref){
                        await newNotice(page);
                        datePast = undefined;
                    }
                console.log("currentHref",currentHref);


            } catch (err) {
                console.error('Error al leer el archivo:', err);
            }


        }
        else{
            await newNotice(page);

        }

        const dateDetails = formatDateFromHref(currentDate, datePast); // Obtén las partes de la fecha

        if(datePast){
            currentDate = moment(currentDate,'MM/DD/YYYY');
            fechaPagina = currentDate.format('DD/MM/YYYY');

        }
        else{
            currentDate = dateDetails.month+"/"+dateDetails.day+"/"+dateDetails.year;
            fechaPagina = moment(new Date(currentDate),'DD/MM/YYYY').format('DD/MM/YYYY');

        }
        console.log(currentDate); 


        if(currentHref && currentDate){
            console.log("sigue");
            if(currentHref){
                await agregarHrefJson({ href: currentHref, fecha:  folderId ? (datePast ? currentDate.format("MM/DD/YYYY") : currentDate ) : moment(new Date(), "MM/DD/YYYY").format("MM/DD/YYYY")});
            }
            if(!folderId){
                console.log("cierrra aquiiiiii");
                await page.close();
                await browser.close();
                return ;
            }
            console.log(currentHref);
            //await saveCurrentHref(currentHref);
            console.log("vamos 11");
            try {
                console.log("go to",currentHref);
                   page.setDefaultNavigationTimeout(0);

                await page.goto(currentHref, { waitUntil:  'networkidle2'});
                //await waitFor(5000);


            } catch (error) {
                console.error("Error navegando a la URL:", error);
            }

  
        


            await waitFor(10000);
            console.log("vamos 133");

            await page.evaluate((device,fechaPagina) => {

                const back = document.querySelector("swg-popup-background");
                if(back){
                    back.style.opacity = 0;
                }

                const oneSignal = document.querySelector("#onesignal-slidedown-container");
                if(oneSignal){
                    oneSignal.style.opacity = 0;
                }



                const cwiz = document.querySelector("c-wiz");
                console.log(cwiz);
                if(cwiz){
                    cwiz.style.opacity = 0;
                }
                const today = document.querySelector("p.todays-date");
                if(today){
                    today.innerText= fechaPagina;

                }

                
                const iframe = document.querySelectorAll("iframe");
                iframe.forEach(add => add.remove());
                document.body.classList.remove('swg-disable-scroll');
                const publicidadMedio = document.querySelector(".ai-viewport-1");
                if(publicidadMedio){
                    publicidadMedio.remove();
                }

          

                if(device !== "celular"){
                    const breadcrumbs = document.querySelector("#js-breadcrumbs");
                    //si no hay publicidades movemos el titulo hacia abajo para poner el banner
                    if(breadcrumbs){
                        breadcrumbs.style["margin-top"] = "275px";
                    }
                }


                if(device === "celular"){
                    
                    const singleResume = document.querySelector("p.single-resume")
                    if(singleResume){
                        singleResume.style["margin-bottom"] = "275px";
                    }
                }

               const jsrenderer = document.querySelectorAll("[jsrenderer]");
               jsrenderer.forEach(add => add.style.opacity = 0);
/*


                if(adds.length === 0 && device !== "celular"){
                    const header = document.querySelector(".main-article--header");
                    //si no hay publicidades movemos el titulo hacia abajo para poner el banner
                    if(header){
                        header.style["margin-top"] = "275px";
                    }
                }

                const adds2 = document.querySelectorAll(".content-banner");
                adds2.forEach(add => add.style.opacity = 0);

                const campana = document.querySelectorAll(".amp-web-push_container");
                campana.forEach(add => add.style.opacity = 0);*/
                //en celular no se debe ver la imagen
                if(device === 'celular'){
                    //document.querySelector(".main-photo").style.opacity = 0
                }
               
            },device, fechaPagina);
            //await waitFor(100000);

            console.log("vamos 1");

            const screenshotBuffer = await page.screenshot();
            // Procesar la imagen final enviando banner1 y banner_costado
            console.log("dando 10 seg mientras toma imagen");
            const finalImageBuffer = await processImage(screenshotBuffer, currentHref, banner1Url, bannerLateralUrl, device, currentDate); // Aquí pasamos las URLs
            console.log("vamos 4341");
    
      
    
            if (dateDetails) {
                const day = dateDetails.day;
                const monthNum = dateDetails.month; // Este será un número, como 9 para septiembre
                const year = dateDetails.year;
    
                // Crear el nombre del archivo
                console.log("vamos 1232");

                
                const finalFileName = `${day}_${monthNum}_${year}__${!device ? 'desktop' : device}_.png`;
                await uploadBufferToDrive(auth, folderId, `${finalFileName}`, finalImageBuffer, 'image/png');
                console.log("vamos 321");
    
                console.log(`Imagen final guardada en Google Drive con el nombre ${finalFileName}`);
            } else {
                console.error('No se pudo extraer la fecha del HREF:', currentHref);
            }
        }
        else{
            console.log("no se obtuvo el href",currentHref);
        }
        intentos = 0;
        await page.close();
    } 
    catch(e){
        console.log("reeeintenta",e );
        const screenshotBuffer = await page.screenshot();
        const moment_date = moment(new Date(datePast ? datePast : new Date()),'DD_MM_YYYY').format('DD/MM/YYYY');
        const hora = moment(new Date(),'hh_mm_ss').format('hh_mm_ss');
        const finalFileName = `${moment_date}_${hora}_${device}_.png`;
        await uploadBufferToDrive(auth, idCarpetaRaiz, `${finalFileName}`, screenshotBuffer, 'image/png');
        hayError = true;
        intentos++;
    }
    finally {
        await browser.close();
        if(hayError && intentos <= 3){
            if(intentos === 3){
                intentos = 0;
            }
            else{
                await captureScreenshotAndUpload(folderId, auth, banner1Url, bannerLateralUrl, datePast, device);
            }
            hayError = false;
        }
    }
}
async function processImage(screenshotBuffer, href, banner1Url, bannerLateralUrl, device, currentDate) {
    let canvasWidth; 
    let canvasHeight;
    console.log("DEVICE", device);
    if(device === 'celular'){
        canvasWidth = device_celular.width;
        canvasHeight = device_celular.height;
        console.log("resolution celular");
    }
    else{
        canvasWidth = 1592;
        canvasHeight = 900;
    }


    // Convertir Uint8Array a Buffer
    const buffer = Buffer.from(screenshotBuffer);

    // Crear un canvas
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    let screenshotImage;

    try {
        // Cargar la imagen usando el buffer convertido
        screenshotImage = await loadImage(buffer);
    } catch (error) {
        console.error('Error al cargar la imagen de captura de pantalla:', error);
        throw new Error('Error al procesar la imagen de captura de pantalla.');
    }

    // Proceder a dibujar en el canvas

    if (device !== 'celular'){
        ctx.drawImage(screenshotImage, 0, 89);

    }
    else{
        ctx.drawImage(screenshotImage, 0, 21);
    }

    let barImage;
    // Cargar bar.png en la parte superior

    if (device !== 'celular'){
        barImage = await loadImage('./public/images/banners/bar.png');

    }
    else{
        console.log("banner celular");

        barImage = await loadImage('./public/images/banners/banner_mobile.png');
    }


   

    ctx.drawImage(barImage, 0, 0);

    if(banner1Url){
        // Cargar banner1 y banner lateral desde las URLs
        const banner1Image = await loadImage(banner1Url); // Una URL pública

        if (device !== 'celular'){
            ctx.drawImage(banner1Image, (canvasWidth - banner1Image.width) / 2, banner1Image.height <= 100 ? 80 + 250 + 90 : 80 + 250 + 20); // Centrado
    
        }
        else{
            console.log("banner1 celular");
            const imageY = canvasHeight - banner1Image.height - 100 - 2;
            // Definir el color del rectángulo
            ctx.fillStyle = "#F6F6F6"; // Color blanco
            // Dibujar el rectángulo que ocupa todo el ancho del canvas
            ctx.fillRect(0, imageY, canvas.width, banner1Image.height);
            // Dibujar la imagen

            ctx.drawImage(banner1Image, (canvasWidth - banner1Image.width) / 2, imageY ); 
        }
    

    }

    if(bannerLateralUrl && device === 'celular'){
        console.log("segundo banner");
        const bannerLateralImage = await loadImage(bannerLateralUrl); // Otra URL pública
        const imageX = (canvas.width - bannerLateralImage.width) / 2;
        const imageY = canvas.height - 100;

        // Definir el color del rectángulo
        ctx.fillStyle = "#F6F6F6"; // Color blanco
        // Dibujar el rectángulo que ocupa todo el ancho del canvas
        ctx.fillRect(0, imageY - 2, canvas.width, bannerLateralImage.height + 2);
        // Dibujar la imagen
        ctx.drawImage(bannerLateralImage, imageX, imageY);

      

    }

    // Formatear la fecha y dibujarla
    const formattedDate = formatDateFromHrefDateTopright(currentDate);
    if(device === 'celular'){
        ctx.font = 'bold 14px "Helvetica Neue", Arial, sans-serif';
        ctx.fillStyle = 'white';
        ctx.fillText(formattedDate, canvasWidth - 90 , 16);
        //if(bannerLateralUrl.height <= 110){
            const x = await loadImage('./public/images/banners/x.png'); // Otra URL pública
            ctx.drawImage(x, canvasWidth - 35, canvasHeight - 100 - 32 - 2); // Ajustar posición
        //}

    }
    else{
        ctx.font = 'bold 14px "Helvetica Neue", Arial, sans-serif';
        ctx.fillStyle = 'white';
        ctx.fillText(formattedDate, canvasWidth - 13 - ctx.measureText(formattedDate).width, 16);

    }


    // Texto de la URL
    const urltext = href;
    ctx.font = "bold 13px 'San Francisco'";
    ctx.fillStyle = "#333333";
    ctx.textBaseline = "middle";

    if(device !== 'celular'){
        const textWidth = ctx.measureText(urltext).width;
        let displayText = urltext;
    
        if (textWidth > 582) {
            const ellipsis = "  ...";
            let truncatedText = urltext;
    
            while (ctx.measureText(truncatedText + ellipsis).width > 582 && truncatedText.length > 0) {
                truncatedText = truncatedText.slice(0, -1);
            }
    
            displayText = truncatedText + ellipsis;
        }
    
        ctx.fillText(displayText, 155, 70);
    }


    return canvas.toBuffer('image/png');
}

// Endpoint principal
app.get('/', async (req, res) => {
    try {
        if(!auth){
            auth = await authorize();
        }
        const parentID = idCarpetaRaiz; // ID de la carpeta raiz
        const folders = await listFolders(auth, parentID); // Obtener carpetas de la carpeta por defecto

        res.render('index', {
            folders,
            currentFolderId: parentID,
            currentFolderName: "Carpeta Raíz",
            message: req.query.message
        });
    } catch (error) {
        console.error('Error listing folders:', error);
        res.status(500).send('Error al cargar las carpetas desde Drive');
    }
});
function formatDateFromHrefDateTopright(href) {
    console.log("formatDateFromHrefDateTopright", href);
    const dataMoment = moment(href, "MM/DD/YYYY");
    return dataMoment.format('D MMM YYYY');
}

app.get('/folders/:id', async (req, res) => {
    const folderId = req.params.id;
    try {
        const subFolders = await listFolders(auth, folderId);
        res.json(subFolders);
    } catch (error) {
        console.error('Error fetching subfolders:', error);
        res.status(500).send('Error al cargar subcarpetas');
    }
});

// Endpoint para subir archivos y procesar JSON
app.post('/upload', upload.fields([{ name: 'banner1' }, { name: 'banner_lateral' }]), async (req, res) => {
    console.log("/upload");
    try {
        const folderId = req.body.folderId; // ID de la carpeta de destino
        const folderName = req.body.folderName; // Nombre de la carpeta
        const dateRange = req.body.daterange; // Rango de fechas
        const device = req.body.device; // Rango de fechas
        let isPastDays = isDateRangeBeforeToday(dateRange);

        const dates = dateRange.split(' - ');
        const startDate = moment(dates[0], 'MM/DD/YYYY');
        const endDate = moment(dates[1], 'MM/DD/YYYY');

        let successMessage = `Los archivos se han subido correctamente a la carpeta: ${folderName}`;
        let banner1Id = null;
        let bannerLateralId = null;

        // Cargar archivos imagenes
        if (req.files['banner1']) {
            const timestamp = Date.now();
            const fileBuffer = req.files['banner1'][0].buffer;
            const fileName = `banner1_${timestamp}.jpg`; //carpeta de los banners
            banner1Id = await uploadBufferToDrive(auth, idCarpetaBanners, fileName, fileBuffer, 'image/jpeg');
        }
        console.log("banner1");


        if (req.files['banner_lateral']) {
            const timestamp = Date.now();
            const fileBuffer = req.files['banner_lateral'][0].buffer;
            const fileName = `banner_lateral_${timestamp}.jpg`;//carpeta de los banners
            bannerLateralId = await uploadBufferToDrive(auth, idCarpetaBanners, fileName, fileBuffer, 'image/jpeg');
        }
        console.log("banner_latera");

        const jsonMimeType = 'application/json';
        const jsonFolderId = idCarpetaJsones; // ID de la carpeta específica donde se guardarán los JSON

            // Procesar cada fecha en el rango
            for (let date = startDate.clone(); date.isSameOrBefore(endDate); date.add(1, 'days')) {
                const currentDate = date.format('MM-DD-YYYY');

                const jsonFileName = `${currentDate}.json`; // Nombre del archivo JSON para esa fecha
                let jsonData = [];

                // Crear una instancia de Google Drive
                const drive = google.drive({ version: 'v3', auth });

                // Intentar obtener el JSON existente
                let idJson;
                try {
                    const existingJsonResponse = await drive.files.list({
                        q: `name='${jsonFileName}' and '${jsonFolderId}' in parents and trashed=false`,
                        fields: 'files(id, name)',
                    });

                    if (existingJsonResponse.data.files.length > 0) {
                        const fileId = existingJsonResponse.data.files[0].id;

                        // Descargar el JSON existente
                        const existingFile = await drive.files.get({
                            fileId: fileId,
                            alt: 'media',
                        }, { responseType: 'arraybuffer' });
                        idJson = existingJsonResponse.data.files[0].id;
                        // Convertir el buffer en un JSON
                        const existingJson = JSON.parse(Buffer.from(existingFile.data).toString('utf-8'));
                        jsonData = existingJson; // Asignar los datos existentes
                    }
                } catch (error) {
                    console.error('Error fetching existing JSON:', error);
                }

                // Crear el objeto que se va a añadir
                const dateObject = {
                    id: Date.now().toString(), // Genera un ID usando el timestamp
                    fecha: currentDate,
                    hora: moment().format('HH:mm:ss'),
                    banner: banner1Id ? `https://drive.google.com/thumbnail?id=${banner1Id}&sz=w1000` : null,
                    banner_lateral: bannerLateralId ? `https://drive.google.com/thumbnail?id=${bannerLateralId}&sz=w1000` : null,
                    folder: folderId, // Agregar el ID de la carpeta
                    folder_name: folderName,
                    device: device
                };

                // Agregar el nuevo objeto a los datos existentes
                if(req.files['banner1'] || req.files['banner_lateral']){
                    jsonData.push(dateObject);
                // Convertir el array de objetos JSON a un buffer
                const jsonBuffer = Buffer.from(JSON.stringify(jsonData, null, 2));

                // Subir el archivo JSON a Google Drive
                await uploadFileToDrive(auth, jsonFolderId, jsonFileName, jsonBuffer, jsonMimeType);

                }
         

            }
        
            console.log("temrina de crear los jsones")


        try {
            console.log(dateRange, "dateRange",  "es antes de hoy", isPastDays);
            if(isPastDays){
               await axios.get(`http://localhost:3000/take-screenshot?range=${dateRange}`);
            }
        }
        catch (e){
            console.log("error", e);
            
        }


        res.redirect('/?no_cargar_jsones_fechas=true&message=' + (!isPastDays ? encodeURIComponent(successMessage): "se crearon los json de fechas pasadas, se crearán las imagenes en breve"));
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).send('Error al cargar el archivo en Google Drive');
    }
});


// Endpoint para obtener JSON por rango de fechas
app.post('/json-by-dates', async (req, res) => {
    console.log("/json-by-dates");
    try {
        const dateRange = req.body.dateRange; // Obtenemos el rango de fechas

        // Validar que dateRange esté definido
        if (!dateRange) {
            return res.status(400).json({ error: 'El rango de fechas es requerido' });
        }

        // Crea una instancia de Google Drive
        const drive = google.drive({ version: 'v3', auth });

        const dates = dateRange.split(' - ');
        const startDate = moment(dates[0], 'MM/DD/YYYY');
        const endDate = moment(dates[1], 'MM/DD/YYYY');
        const jsonFolderId = idCarpetaJsones; // ID de la carpeta donde se guardan los JSON

        let jsonResults = [];
        await waitFor(5000);
        // Procesar cada fecha en el rango
        for (let date = startDate.clone(); date.isSameOrBefore(endDate); date.add(1, 'days')) {
            console.log(date);
            await waitFor(2000);

            const currentDate = date.format('MM-DD-YYYY');
            const jsonFileName = `${currentDate}.json`;

            // Intentar obtener el JSON para esa fecha
            const existingJsonResponse = await drive.files.list({
                q: `name='${jsonFileName}' and '${jsonFolderId}' in parents and trashed=false`,
                fields: 'files(id)',
            });


            if (existingJsonResponse.data.files.length > 0) {
                const fileId = existingJsonResponse.data.files[0].id;

                // Descargar el JSON existente
                const existingFile = await drive.files.get({
                    fileId: fileId,
                    alt: 'media',
                }, { responseType: 'arraybuffer' });
                // Convertir el buffer en un JSON y agregarlo a los resultados
                const jsonData = JSON.parse(Buffer.from(existingFile.data).toString('utf-8'));
                jsonResults.push(...jsonData); // Aquí agregamos los datos al array
            }
            else{
                console.log("no existe ",currentDate)
            }
        }
        console.log("json-by-dates",jsonResults);
        res.json(jsonResults);
    } catch (error) {
        console.error('Error fetching JSONs by dates:', error);
        res.status(500).json({ error: 'Error al cargar los archivos JSON.' });
    }
});

// Endpoint para eliminar un ítem del JSON
app.post('/delete-json-item', async (req, res) => {
    try {
        const { fecha, itemId } = req.body; // Obtener fecha e ID del ítem
        const jsonFolderId = idCarpetaJsones; // ID de la carpeta donde se guardan los JSON
        const jsonFileName = `${fecha}.json`; // Nombre del archivo JSON para esa fecha

        const drive = google.drive({ version: 'v3', auth });

        // Intentar obtener el JSON para esa fecha
        const existingJsonResponse = await drive.files.list({
            q: `name='${jsonFileName}' and '${jsonFolderId}' in parents and trashed=false`,
            fields: 'files(id)',
        });

        if (existingJsonResponse.data.files.length > 0) {
            const fileId = existingJsonResponse.data.files[0].id;

            // Descargar el JSON existente
            const existingFile = await drive.files.get({
                fileId: fileId,
                alt: 'media',
            }, { responseType: 'arraybuffer' });

            // Convertir el buffer en un JSON
            const jsonData = JSON.parse(Buffer.from(existingFile.data).toString('utf-8'));

            // Filtrar el ítem que se desea eliminar
            const updatedData = jsonData.filter(item => item.id !== itemId); // Filtra el ítem por ID

            // Convertir el array actualizado a un buffer
            const jsonBuffer = Buffer.from(JSON.stringify(updatedData, null, 2));

            // Subir el archivo JSON actualizado a Google Drive
            await drive.files.update({
                fileId: fileId,
                media: {
                    mimeType: 'application/json',
                    body: streamifier.createReadStream(jsonBuffer),
                },
            });

            res.json({ message: 'Ítem eliminado correctamente' });
        } else {
            res.status(404).json({ error: 'No se encontró el archivo para eliminar el ítem' });
        }
    } catch (error) {
        console.error('Error deleting JSON item:', error);
        res.status(500).json({ error: 'Error al eliminar el ítem del JSON' });
    }
});

// Nuevo endpoint para capturar pantallas
app.post('/screenshot', async (req, res) => {
    console.log("/screenshot");
    try {
        const { folderId, banner1, banner_costado, datePast ,device} = req.body; // Obtener el ID de la carpeta, banner1 y banner_costado
        console.log("datePast",datePast);
        await captureScreenshotAndUpload(folderId, auth, banner1, banner_costado, datePast, device); // Pasa banner1 y banner_costado a la función
        console.log("siguió");
        res.status(200).json({ message: 'Captura de pantalla realizada con éxito.' });
    } catch (error) {
        console.error('Error tomando la captura de pantalla:', error);
        res.status(500).json({ error: 'Error al tomar la captura de pantalla.' });
    }
});

app.get('/start', async (req, res) => {
    console.log("start");
    res.send('iniciado');
});

function obtenerFechaActual() {
    const fechaActual = new Date();
    const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const dia = String(fechaActual.getDate()).padStart(2, '0');
    const año = fechaActual.getFullYear();
    const fechaFormateada = `${mes}/${dia}/${año}`;
    return `${fechaFormateada} - ${fechaFormateada}`;
}

function isDateRangeBeforeToday(dateRangeString) {
    // Dividir el string para obtener las fechas inicial y final
    const dates = dateRangeString.split(" - ");

    // Crear objetos moment para las fechas inicial y final
    const startDate = moment(dates[0], 'MM/DD/YYYY'); // La fecha de inicio
    const endDate = moment(dates[1], 'MM/DD/YYYY');   // La fecha de fin
    const today = moment(); // La fecha actual

    // Verificar si ambas fechas son anteriores a hoy
    return startDate.isBefore(today, 'day') || endDate.isBefore(today, 'day');
}
function esFechaHoyOPosterior(fechaStr) {
    // Convertir la cadena de fecha al formato deseado
    const fecha = moment(fechaStr, "MM-DD-YYYY");
    // Obtener la fecha actual
    const hoy = moment();

    // Comparar las fechas
    return fecha.isSameOrAfter(hoy, 'day');
}

app.get('/take-screenshot', async (req, res) => {
    console.log("/take-screenshot'");
    try {
        if(!auth){
            auth = await authorize(); // Reautenticarse si es necesario
        }
        
        const { range } = req.query;  //verificar fechas pasadas
        console.log("rang",range);
        if(range){
            console.log(isDateRangeBeforeToday(range));
        }
        console.log("json-by-dates");
        const response = await axios.post('http://localhost:3000/json-by-dates', {
            dateRange: range && isDateRangeBeforeToday(range) ? range : obtenerFechaActual() 
        });

        /*const resultadosUnicos = [];
        const set = new Set(); // Crear un Set para los identificadores únicos
        
        response.data.forEach(current => {
            // Crear un identificador único basado en las claves especificadas
            const identifier = `${current.fecha}|${current.folder}|${current.folder_name}|${current.device}`;
        
            // Verificamos si el identificador ya está en el Set
            if (!set.has(identifier)) {
                set.add(identifier); // Agregar identificador al Set
                resultadosUnicos.push(current); // Agregar el objeto actual a los resultados únicos
            }
        });
        const resultados = resultadosUnicos;*/
        const resultados = response.data;

        console.log(resultados.length);

        let contador= 0;
        for (let date of resultados) {
            contador ++;
            if(range){
                console.log("-------------",range, "---------");
            }
            else{
                console.log("-------------",obtenerFechaActual(), "---------");
            }
            if(resultados && resultados.length){
                console.log(contador," de ", resultados.length);
            }

            console.log(date);
            if(range && !esFechaHoyOPosterior(date.fecha) || !range){

                let object = {
                    folderId: date.folder,
                    banner1: date.banner,
                    banner_costado: date.banner_lateral,
                    device: date.device
                }
                if(range){
                    object.datePast=date.fecha;
                }
                if(object.banner1 || object.banner_costado){
                    console.log("http://localhost:3000/screenshot");
                    const screen = await axios.post('http://localhost:3000/screenshot', object);
                    console.log(screen.data);
                }
                

            }
        }
        if(!range && resultados.length === 0){
            await axios.post('http://localhost:3000/screenshot', {})
        }

        res.status(200).json({ message: 'Proceso completado', resultados: resultados });
    } catch (error) {
        res.status(500).json({ message: 'Error en el proceso', error: error.message });
    }
});

// Inicia el servidor
app.listen(port, () => {
    console.log(`El servidor está corriendo en http://localhost:${port}`);
});
