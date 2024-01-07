const pool = require("../database/index");
const bcrypt = require('bcrypt');

const saltRounds = 10;

function getUserData(kullanici_id, roles, isim, soyisim, telefon, dogumtarihi, cinsiyet, address, email) {
    
    return {
        userId: kullanici_id,
        role: roles,
        name: isim,
        surname: soyisim,
        phone: telefon,
        birth_date: dogumtarihi,
        gender: cinsiyet,
        city: address,
        email: email
    };
}

function getPollsterData(title, startDate, endDate, city, district, template, percentageOfWomen){
    return{
        title: title,
        startDate: startDate,
        endDate: endDate,
        city: city,
        district: district,
        template: template,
        percentageOfWomen: percentageOfWomen
    }
}

async function getUserName(kullanici_id) {
    const [user,] = await pool.query("SELECT isim FROM kullanicilar WHERE kullanici_id = ?", [kullanici_id]);
    return user[0].isim;
}

async function getNotifs() {
    const [bildirimler,] = await pool.query("SELECT * FROM bildirim");
    return Promise.all(bildirimler.map(async bildirim => {
        const isim = await getUserName(bildirim.kullanici_id);
        return {
            id: bildirim.bildirim_id,
            title: bildirim.baslik,
            status: bildirim.durum,
            person: isim,
            date: bildirim.created_date
        };
    }));
}


const authController ={

    register: async (req, res) => {
        try {
            const { email, password, name, surname, phone, birthDate, role, city, district, gender} = req.body;
    
            // il_adı'nın karşılık gelen il_id'sini bul
            const [cityRows, cityFields] = await pool.query("SELECT il_id FROM iller WHERE il_adi = ?", [city]);
        
            const il_id = cityRows[0].il_id;
    
            // il ve ilçe'nin daha önce girilip girilmediğini kontrol et
            const [locationRows, locationFields] = await pool.query("SELECT konum_id FROM konum WHERE il_id = ? AND ilçe = ?", [il_id, district]);
            let konum_id;
            if (locationRows.length > 0) {
                konum_id = locationRows[0].konum_id;
            } else {
                // Yeni konum_id oluştur ve konum tablosuna ekle
                const locationSql = "INSERT INTO konum (il_id, ilçe) VALUES (?, ?)";
                const [locationInsertRows, locationInsertFields] = await pool.query(locationSql, [il_id, district]);
                konum_id = locationInsertRows.insertId;
            }
    
            // Email kontrolü
            const [user,] = await pool.query("SELECT * FROM kullanicilar WHERE email = ?", [email]);
            if (user[0]) {
                return res.json({ error: "Bu maile kayıtlı bir kullanıcı zaten var!" });
            }
    
            // Şifreyi hashle
            const hashedPassword = await bcrypt.hash(password, saltRounds);
    
            // Kullanıcıyı veritabanına ekle
            const userSql = "INSERT INTO kullanicilar ( email, sifre, Isim, Soyisim, telefon, dogumtarihi, rol, konum_id, cinsiyet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
            const [userRows, userFields] = await pool.query(userSql, [email, hashedPassword, name, surname, phone, birthDate, role, konum_id, gender]);
    
            if (userRows.affectedRows) {
                return res.json({ message: "Kayıt başarılı. Yönetici onayını bekleyiniz." });
            } else {
                return res.json({ error: "Kayıt işlemi başarısız oldu!" });
            }
        } catch (error) {
            console.log(error);
            res.json({
                error: error.message
            });
        }
    },
    login: async (req, res) => {
        try {
            const { email:_email , password } = req.body;
    
            // Kullanıcının e-postasını kontrol et
            const [user,] = await pool.query("SELECT * FROM kullanicilar WHERE email = ?", [_email]);
            if (!user[0]) return res.json({ error: "Invalid email or password!" });
        

            const { sifre: hash, kullanici_id, isim, soyisim, telefon, rol, dogumtarihi, konum_id, cinsiyet, durum, email} = user[0];
    
            if (durum === 0) return res.json({ error: "Henüz kullanıcı kaydınız onaylanmadı!" });

            // Şifreyi kontrol et
            const check = await bcrypt.compare(password, hash);
    
            if (check) {
                const cityQuery = "SELECT iller.il_adi FROM iller JOIN konum ON iller.il_id = konum.il_id WHERE konum.konum_id = ?";
                const [cityResult,] = await pool.query(cityQuery, [konum_id]);
                const city = cityResult[0].city;

                const districtQuery = "SELECT konum.ilçe FROM konum WHERE konum.konum_id = ?";
                const [districtResult,] = await pool.query(districtQuery, [konum_id]);
                const district = districtResult[0].district;

                // Anketör ve İş bilgilerini birleştir
                const query = `
                    SELECT anketör.*, iş.is_basligi, iş.baslangic_tarihi, iş.bitis_tarihi, 
                    iş.belirlenen_sablon, iş.kadin_orani FROM anketör LEFT JOIN iş ON anketör.yapilacak_is = iş.is_id WHERE anketör.kullanici_id = ?`;
                const [result,] = await pool.query(query, [kullanici_id]);

            if (result.length > 0) {
                const {
                    title,
                    startDate,
                    endDate,
                    template,
                    percentageOfWomen
                } = result[0];
                console.log(result[0]);

                // Anketör verilerini getPollsterData fonksiyonuyla birleştir
                const pollsterData = getPollsterData(result[0].title, startDate, endDate, city, district, template, percentageOfWomen);


                let userData = {"userData":getUserData(kullanici_id, rol, isim, soyisim, telefon, dogumtarihi, cinsiyet, city, email)};
                const notifData = await getNotifs();
                userData = {...userData, "notifData": notifData};

                if(rol === "Anketör"){
                    console.log("pollsterData:", pollsterData);
                    userData = {...notifData, ...pollsterData};
                }
                return res.json(userData);
            }
        }
            
        return res.json({ error: "Wrong password!" });
        }
         catch (error) {
            console.log(error);
            res.json({
                error: error.message
            });
        }
    },
    template: async(req,res) =>{
        
        try{
            const {amac, baslik } = req.body

            const [check,] = await pool.query("SELECT * FROM sablon WHERE baslik = ?", [baslik]);
            if (check[0]) {
                return res.json({ error: "Bu tarz bir anket için gerekli şablon var." });
            }

            const userSql = "INSERT INTO sablon (amac, baslik) VALUES (?, ?)";
            const [userRows, userFields] = await pool.query(userSql, [amac, baslik]);
            if (userRows.affectedRows) {
                return res.json({ message: "Template added successfully" });
            } else {
                return res.json({ error: "Failed to add template" });
            }
        }   
        catch (error) {
            console.log(error);
            res.json({
                error: error.message
            });
        }
    },
    getRegister:async(req,res) =>{
        try {
            // İllerin listesini al
            const [iller,] = await pool.query("SELECT * FROM iller");
            let cities = iller.map(il => il.il_adi);
    
            // İlçelerin listesini al
            let districts = {};
            for (let il of iller) {
                const [ilceler,] = await pool.query("SELECT ilçe FROM konum WHERE il_id = ?", [il.il_id]);
                districts[il.il_adi] = ilceler.map(ilce => ilce.ilçe);
            }
    
            res.json({
                cities: cities,
                districts: districts
            });
        } catch (error) {
            console.log(error.message + " Error occurred");
            res.json({
                status: "error"
            });
        }
    },
    unregisteredUsers:async(req,res) =>{
        try{
            const [rows, fields] = await pool.query(
                "SELECT k.kullanici_id, k.email, k.isim, k.soyisim, i.il_adi, ko.ilçe FROM kullanicilar AS k JOIN konum AS ko ON k.konum_id = ko.konum_id JOIN iller AS i ON ko.il_id = i.il_id WHERE k.durum = 0")
            res.json({
                registeredUsers: rows
            })
        }
        catch (error){
            console.log(error.message +"Error occured");
            res.json({
                status: "error"
            })
        }
    },
    registeringUsers: async (req, res) => {
        try {
            const { id, islem } = req.body;
    
            const [check,] = await pool.query("SELECT * FROM kullanicilar WHERE kullanici_id = ?", [id]);
            if (check[0]) {
                if (islem === "accept") {
                    const userSql = "UPDATE kullanicilar SET durum = 1 WHERE kullanici_id = ?";
                    const [userRows, userFields] = await pool.query(userSql, [id]);
                    if (userRows.affectedRows) {
                        const { rol } = check[0];
                        let roleSql;
                        if (rol === 'Anketör') {
                            roleSql = "INSERT INTO anketör (kullanici_id) VALUES (?)";
                        } else if (rol === 'Planlayıcı') {
                            roleSql = "INSERT INTO planlamaci (kullanici_id) VALUES (?)";
                        } else if (rol === 'Yönetici') {
                            roleSql = "INSERT INTO yönetici (kullanici_id) VALUES (?)";
                        }
                        await pool.query(roleSql, [id]);
                        return res.json({ message: "Kullanıcının durumu güncellendi ve rol tablosuna eklendi." });
                    }
                    
                    else {
                        return res.json({ error: "Kullanıcının durumunu güncelleme başarısız oldu." });
                    }
                } else {
                    const userSql = "DELETE FROM kullanicilar WHERE kullanici_id = ?";
                    const [userRows, userFields] = await pool.query(userSql, [id]);
                    if (userRows.affectedRows) {
                        return res.json({ message: "Kullanıcı silindi." });
                    } else {
                        return res.json({ error: "Kullanıcıyı silme başarısız oldu." });
                    }
                }
            } else {
                return res.json({ error: "Bu ID'ye sahip bir kullanıcı bulunamadı." });
            }
        } catch (error) {
            console.log(error);
            res.json({
                error: error.message
            });
        }
    },
    getTaskCreate: async (req, res) => {
        try {
            // Anketörlerin isimlerini çek
            const [anketorler,] = await pool.query("SELECT a.kullanici_id, k.isim FROM anketör a INNER JOIN kullanicilar k ON a.kullanici_id = k.kullanici_id WHERE a.yapilacak_is IS NULL");
            const pollsters = anketorler.map(anketor => `Id:${anketor.kullanici_id}, ismi: ${anketor.isim}`);
    
            // Şablonların isimlerini çek
            const [sablonlar,] = await pool.query("SELECT baslik FROM sablon");
            const templates = sablonlar.map(sablon => sablon.baslik);
    
            // Sonuçları döndür
            return res.json({
                sablonlar: templates,
                pollsters: pollsters
            });
        } catch (error) {
            console.log(error);
            res.json({
                error: error.message
            });
        }
    },
    taskCreate: async (req, res) => {
        try {
            const { city, district, endDate, numberOfSurveys, percentageOfWomen, pollster, startDate, template, title } = req.body;
        
            // Parse the pollster id from the pollster string
            const pollsterId = pollster.split(':')[1];
            const pollsterIdFixed = pollsterId.split(',')[0];
            console.log(pollsterIdFixed);
            
            // Get the pollster's name
            const [pollsterInfo,] = await pool.query("SELECT k.isim FROM kullanicilar k WHERE k.kullanici_id = ?", [pollsterId]);
            const pollsterName = pollsterInfo[0].isim;
    
            // Insert the new task into the database
            const insertQuery = `
            INSERT INTO iş (anket_sayisi, baslangic_tarihi, bitis_tarihi, belirlenen_sablon, is_basligi, kadin_orani, konum_id)
            VALUES (?, ?, ?, ?, ?, ?, 6)`;
        
            const insertValues = [numberOfSurveys, startDate, endDate, template, title, percentageOfWomen, city];
    
            const insertRows = await pool.query(insertQuery, insertValues);
    
            // Get the newly inserted task's ID
            const taskIdQuery = "SELECT * FROM iş ORDER BY is_id DESC LIMIT 1";
            const [taskIdResult,] = await pool.query(taskIdQuery);
            const taskId = taskIdResult[0].is_id;

            // Update the pollster's yapilacak_is field
            const updatePollsterQuery = "UPDATE anketör SET yapilacak_is = ? WHERE kullanici_id = ?";
            const updatePollsterValues = [taskId, pollsterIdFixed];

            await pool.query(updatePollsterQuery, updatePollsterValues);
        
            // Return success response
            return res.json({
                message: "Task created successfully"
            });
        } catch (error) {
            console.log(error);
            res.status(500).json({
                error: error.message
            });
        }
    }
    
};

module.exports = authController;