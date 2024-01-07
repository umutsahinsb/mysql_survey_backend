const pool = require("../database/index");
const bcrypt = require('bcrypt');

const saltRounds = 10;

function getUserData(kullanici_id, roles, Isim, Soyisim, telefon, dogumtarihi, cinsiyet, address) {
    
    return {
        userId: kullanici_id,
        role: roles,
        name: Isim,
        surname: Soyisim,
        phone: telefon,
        birth_date: dogumtarihi,
        gender: cinsiyet,
        city: address
    };
}

async function getUserName(kullanici_id) {
    const [user,] = await pool.query("SELECT isim FROM kullanicilar WHERE kullanici_id = ?", [kullanici_id]);
    return user[0].isim;
}
async function getNotifs() {
    const [user,] = await pool.query("SELECT * FROM bildirim ");
    return user;
}

function getNotifData(bildirim_id, baslik, kullanici_id, durum, date, isim) {
    return {
        id: bildirim_id,
        title: baslik,
        status: durum,
        person: isim,
        date: date
    };
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
            const { email, password } = req.body;
    
            // Kullanıcının e-postasını kontrol et
            const [user,] = await pool.query("SELECT * FROM kullanicilar WHERE email = ?", [email]);
            if (!user[0]) return res.json({ error: "Invalid email or password!" });
        

            const { sifre: hash, kullanici_id, Isim, Soyisim, telefon, rol, dogumtarihi, cinsiyet, address, durum} = user[0];
    
            if (durum === 0) return res.json({ error: "Henüz kullanıcı kaydınız onaylanmadı!" });

            // Şifreyi kontrol et
            const check = await bcrypt.compare(password, hash);
    
            if (check) {
                let userData = {"userData":getUserData(kullanici_id, rol, Isim, Soyisim, telefon, dogumtarihi, cinsiyet, address)};
                userData = {...userData,"notifData":getNotifs()} 
                return res.json(userData);
            }
    
            return res.json({ error: "Wrong password!" });
    
        } catch (error) {
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
                        return res.json({ message: "Kullanıcının durumu güncellendi." });
                    } else {
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
    }
};

module.exports = authController;