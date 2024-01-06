const pool = require("../database/index");
const bcrypt = require('bcrypt');

const saltRounds = 10;


const sehir ={
    0: "Istanbul",
    1: "Ankara"
};    

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

const authController ={

    register: async (req, res) => {
        try {
            const { email, password, name, surname, phone, dogum, rol, city, district } = req.body;
    
            // il_adı'nın karşılık gelen il_id'sini bul
            const [cityRows, cityFields] = await pool.query("SELECT il_id FROM anketyonetimsistemi.iller WHERE il_adi = ?", [city]);
            if (cityRows.length === 0) {
                return res.json({ error: "City does not exist!" });
            }
            const il_id = cityRows[0].il_id;
    
            // il ve ilçe'nin daha önce girilip girilmediğini kontrol et
            const [locationRows, locationFields] = await pool.query("SELECT konum_id FROM anketyonetimsistemi.konum WHERE il_id = ? AND ilçe = ?", [il_id, district]);
            let konum_id;
            if (locationRows.length > 0) {
                konum_id = locationRows[0].konum_id;
            } else {
                // Yeni konum_id oluştur ve konum tablosuna ekle
                const locationSql = "INSERT INTO anketyonetimsistemi.konum (il_id, ilçe) VALUES (?, ?)";
                const [locationInsertRows, locationInsertFields] = await pool.query(locationSql, [il_id, district]);
                konum_id = locationInsertRows.insertId;
            }
    
            // Email kontrolü
            const [user,] = await pool.query("SELECT * FROM anketyonetimsistemi.kullanicilar WHERE email = ?", [email]);
            if (user[0]) {
                return res.json({ error: "Email already exists!" });
            }
    
            // Şifreyi hashle
            const hashedPassword = await bcrypt.hash(password, saltRounds);
    
            // Kullanıcıyı veritabanına ekle
            const userSql = "INSERT INTO anketyonetimsistemi.kullanicilar ( email, sifre, Isim, Soyisim, telefon, dogumtarihi, rol, konum_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
            const [userRows, userFields] = await pool.query(userSql, [email, hashedPassword, name, surname, phone, dogum, rol, konum_id]);
    
            if (userRows.affectedRows) {
                return res.json({ message: "Registration successful" });
            } else {
                return res.json({ error: "Registration failed" });
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
            const [user,] = await pool.query("SELECT * FROM anketyonetimsistemi.kullanicilar WHERE email = ?", [email]);
            if (!user[0]) return res.json({ error: "Invalid email!" });
        

            const { sifre: hash, kullanici_id, Isim, Soyisim, telefon, rol, dogumtarihi, cinsiyet, address} = user[0];
    
            // Şifreyi kontrol et
            const check = await bcrypt.compare(password, hash);
    
            if (check) {
                let userData = getUserData(kullanici_id, rol, Isim, Soyisim, telefon, dogumtarihi, cinsiyet, address);
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
};

module.exports = authController;