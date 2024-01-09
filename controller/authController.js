const pool = require("../database/index");
const bcrypt = require("bcrypt");

const saltRounds = 10;

function getUserData(
  kullanici_id,
  roles,
  isim,
  soyisim,
  telefon,
  dogumtarihi,
  cinsiyet,
  address,
  email
) {
  return {
    userId: kullanici_id,
    role: roles,
    name: isim,
    surname: soyisim,
    phone: telefon,
    birth_date: dogumtarihi,
    gender: cinsiyet,
    city: address,
    email: email,
  };
}


function getPollsterData(
  taskId,
  title,
  startDate,
  endDate,
  city,
  district,
  template,
  percentageOfWoman
) {
  return {
    taskId: taskId,
    title: title,
    startDate: startDate,
    endDate: endDate,
    city: city,
    district: district,
    template: template,
    percentageOfWoman: percentageOfWoman,
  };
}

async function getPlannerData() {
  // 1. İş Sayısı
  const [tasksResult] = await pool.query("SELECT COUNT(*) AS tasks FROM iş");
  const tasks = tasksResult[0].tasks;

  // 2. Anket Sayısı
  const [surveysResult] = await pool.query(
    "SELECT SUM(anket_sayisi) AS surveys FROM iş"
  );
  const surveys = surveysResult[0].surveys;

  // 3. İşlemdeki ve Tamamlanan Görev Sayısı
  const [inProcessDoneResult] = await pool.query(
    "SELECT SUM(CASE WHEN durum = 0 THEN 1 ELSE 0 END) AS inProcess, SUM(CASE WHEN durum = 1 THEN 1 ELSE 0 END) AS done FROM iş"
  );
  const inProcess = inProcessDoneResult[0].inProcess;
  const done = inProcessDoneResult[0].done;

  // 4. Kadın ve Erkek Oranları
  const [genderRatioResult] = await pool.query(
    "SELECT AVG(kadin_orani) AS percentageOfWoman FROM iş"
  );
  const percentageOfWoman = genderRatioResult[0].percentageOfWoman;
  const percentageOfMan = 100 - genderRatioResult[0].percentageOfWoman;

  return {
    tasks: tasks,
    surveys: surveys,
    inProcess: inProcess,
    done: done,
    percentageOfWoman: percentageOfWoman,
    percentageOfMan: percentageOfMan,
  };
}

async function getUserName(kullanici_id) {
  const [user] = await pool.query(
    "SELECT isim FROM kullanicilar WHERE kullanici_id = ?",
    [kullanici_id]
  );
  return user[0].isim;
}

async function getNotifs() {
  const [bildirimler] = await pool.query("SELECT * FROM bildirim");
  return Promise.all(
    bildirimler.map(async (bildirim) => {
      const isim = await getUserName(bildirim.kullanici_id);
      return {
        id: bildirim.bildirim_id,
        title: bildirim.baslik,
        status: bildirim.durum,
        person: isim,
        date: bildirim.created_date,
      };
    })
  );
}

const authController = {
  register: async (req, res) => {
    try {
      const {
        email,
        password,
        name,
        surname,
        phone,
        birthDate,
        role,
        city,
        district,
        gender,
      } = req.body;

      // il_adı'nın karşılık gelen il_id'sini bul
      const [cityRows, cityFields] = await pool.query(
        "SELECT il_id FROM iller WHERE il_adi = ?",
        [city]
      );

      const il_id = cityRows[0].il_id;

      // il ve ilçe'nin daha önce girilip girilmediğini kontrol et
      const [locationRows, locationFields] = await pool.query(
        "SELECT konum_id FROM konum WHERE il_id = ? AND ilçe = ?",
        [il_id, district]
      );
      let konum_id;
      if (locationRows.length > 0) {
        konum_id = locationRows[0].konum_id;
      } else {
        // Yeni konum_id oluştur ve konum tablosuna ekle
        const locationSql = "INSERT INTO konum (il_id, ilçe) VALUES (?, ?)";
        const [locationInsertRows, locationInsertFields] = await pool.query(
          locationSql,
          [il_id, district]
        );
        konum_id = locationInsertRows.insertId;
      }

      // Email kontrolü
      const [user] = await pool.query(
        "SELECT * FROM kullanicilar WHERE email = ?",
        [email]
      );
      if (user[0]) {
        return res.json({ error: "Bu maile kayıtlı bir kullanıcı zaten var!" });
      }

      // Şifreyi hashle
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Kullanıcıyı veritabanına ekle
      const userSql =
        "INSERT INTO kullanicilar ( email, sifre, Isim, Soyisim, telefon, dogumtarihi, rol, konum_id, cinsiyet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
      const [userRows, userFields] = await pool.query(userSql, [
        email,
        hashedPassword,
        name,
        surname,
        phone,
        birthDate,
        role,
        konum_id,
        gender,
      ]);

      if (userRows.affectedRows) {
        return res.json({
          message: "Kayıt başarılı. Yönetici onayını bekleyiniz.",
        });
      } else {
        return res.json({ error: "Kayıt işlemi başarısız oldu!" });
      }
    } catch (error) {
      console.log(error);
      res.json({
        error: error.message,
      });
    }
  },
  login: async (req, res) => {
    try {
      const { email: _email, password } = req.body;

      // Kullanıcının e-postasını kontrol et
      const [user] = await pool.query(
        "SELECT * FROM kullanicilar WHERE email = ?",
        [_email]
      );
      if (!user[0]) return res.json({ error: "Invalid email or password!" });

      const {
        sifre: hash,
        kullanici_id,
        isim,
        soyisim,
        telefon,
        rol,
        dogumtarihi,
        konum_id,
        cinsiyet,
        durum,
        email,
      } = user[0];

      if (durum === 0)
        return res.json({ error: "Henüz kullanıcı kaydınız onaylanmadı!" });

      // Şifreyi kontrol et
      const check = await bcrypt.compare(password, hash);

      if (!check) {
        return res.json({ error: "Wrong password!" });
      }
      // Anketör için ana ekran
      if (rol === "Anketör") {
        const cityQuery =
          "SELECT iller.il_adi FROM iller JOIN konum ON iller.il_id = konum.il_id WHERE konum.konum_id = ?";
        const [cityResult] = await pool.query(cityQuery, [konum_id]);
        const city = cityResult[0].il_adi;
        console.log(city);
        const districtQuery = "SELECT ilçe FROM konum WHERE konum_id = ?";
        const [districtResult] = await pool.query(districtQuery, [konum_id]);
        const district = districtResult[0].ilçe;
        console.log(district);
        // Anketör ve İş bilgilerini birleştir
        
        const query = `CALL GetAnketorAndIsInfo(?)`;
        const [result] = await pool.query(query, kullanici_id);
        console.log(result);
        if (result.length > 0) {
          const { is_id, is_basligi, baslangic_tarihi, bitis_tarihi, belirlenen_sablon, kadin_orani } =
            result[0];
          console.log(result[0]);
          // Anketör verilerini getPollsterData fonksiyonuyla birleştir
          const pollsterData = getPollsterData(
            result[0].is_id,
            result[0].is_basligi,
            result[0].baslangic_tarihi,
            result[0].bitis_tarihi,
            city,
            district,
            result[0].belirlenen_sablon,
            result[0].kadin_orani
          );
          console.log("Pollster Data:", pollsterData);
          let userData = {
            userData: getUserData(
              kullanici_id,
              rol,
              isim,
              soyisim,
              telefon,
              dogumtarihi,
              cinsiyet,
              city,
              email
            ),
          };
          const notifData = await getNotifs();
          userData = { ...userData, notifData: notifData };
          userData = { ...userData, pollsterData: pollsterData };
          
          const questionSablonId = result[0].belirlenen_sablon;
          const questionQuery = "SELECT soru_id AS id, soru AS title FROM sorular WHERE sablon_id = ?";
          const [questionResults] = await pool.query(questionQuery, [questionSablonId]);
          console.log(questionResults);
          userData = {...userData, questions: questionResults};
          return res.json(userData);
        }
      }
      //Planlamacı için ana ekran
      else if (rol === "Planlayıcı") {
        const cityQuery =
          "SELECT iller.il_adi FROM iller JOIN konum ON iller.il_id = konum.il_id WHERE konum.konum_id = ?";
        const [cityResult] = await pool.query(cityQuery, [konum_id]);
        const city = cityResult[0].il_adi;

        let userData = {
          userData: getUserData(
            kullanici_id,
            rol,
            isim,
            soyisim,
            telefon,
            dogumtarihi,
            cinsiyet,
            city,
            email
          ),
        };
        const notifData = await getNotifs();
        const plannerUserData = await getPlannerData();
        userData = { ...userData, notifData: notifData };
        userData = { ...userData, plannerUserData: plannerUserData };
        console.log(userData);
        return res.json(userData);
      }
      // Yönetici için ana ekran
      else if (rol === "Yönetici") {
        const cityQuery =
          "SELECT iller.il_adi FROM iller JOIN konum ON iller.il_id = konum.il_id WHERE konum.konum_id = ?";
        const [cityResult] = await pool.query(cityQuery, [konum_id]);
        const city = cityResult[0].il_adi;

        let userData = {
          userData: getUserData(
            kullanici_id,
            rol,
            isim,
            soyisim,
            telefon,
            dogumtarihi,
            cinsiyet,
            city,
            email
          ),
        };
        const notifData = await getNotifs();
        userData = { ...userData, notifData: notifData };
        console.log(userData);
        return res.json(userData);
      }
    } catch (error) {
      console.log(error);
      res.json({
        error: error.message,
      });
    }
  },
  template: async (req, res) => {
    try {
      const { purpose, title, questions } = req.body;

      const [check] = await pool.query(
        "SELECT * FROM sablon WHERE baslik = ?",
        [title]
      );
      if (check[0]) {
        return res.json({
          error: "Bu tarz bir anket için gerekli şablon var.",
        });
      }

      const userSql = "INSERT INTO sablon (amac, baslik) VALUES (?, ?)";
      const [userRows, userFields] = await pool.query(userSql, [purpose, title]);
      if (!userRows.affectedRows) {
        return res.json({ error: "Şablon oluşturulamadı!" });
      } 
      
      const templateIdQuery = "SELECT sablon_id FROM sablon ORDER BY sablon_id DESC LIMIT 1";
      const [templateIdResult] = await pool.query(templateIdQuery);
      
      const templateId = templateIdResult[0].sablon_id;

      console.log(templateId);
      console.log(questions);

      const questionsSql = "INSERT INTO sorular (sablon_id, soru) VALUES ?";
      const questionsValues = questions.map((questions) => [templateId, questions]);
      await pool.query(questionsSql, [questionsValues]);

      return res.json({ message: "Şablon başarıyla oluşturuldu!" });


    } catch (error) {
      console.log(error);
      res.json({
        error: error.message,
      });
    }
  },
  getRegister: async (req, res) => {
    try {
      // İllerin listesini al
      const [iller] = await pool.query("SELECT * FROM iller");
      let cities = iller.map((il) => il.il_adi);

      // İlçelerin listesini al
      let districts = {};
      for (let il of iller) {
        const [ilceler] = await pool.query(
          "SELECT ilçe FROM konum WHERE il_id = ?",
          [il.il_id]
        );
        districts[il.il_adi] = ilceler.map((ilce) => ilce.ilçe);
      }

      res.json({
        cities: cities,
        districts: districts,
      });
    } catch (error) {
      console.log(error.message + " Error occurred");
      res.json({
        status: "error",
      });
    }
  },
  unregisteredUsers: async (req, res) => {
    try {
      const [rows, fields] = await pool.query(
        "SELECT k.kullanici_id, k.email, k.isim, k.soyisim, i.il_adi, ko.ilçe FROM kullanicilar AS k JOIN konum AS ko ON k.konum_id = ko.konum_id JOIN iller AS i ON ko.il_id = i.il_id WHERE k.durum = 0"
      );
      res.json({
        registeredUsers: rows,
      });
    } catch (error) {
      console.log(error.message + "Error occured");
      res.json({
        status: "error",
      });
    }
  },
  registeringUsers: async (req, res) => {
    try {
      const { id, islem } = req.body;

      const [check] = await pool.query(
        "SELECT * FROM kullanicilar WHERE kullanici_id = ?",
        [id]
      );
      if (check[0]) {
        if (islem === "accept") {
          const userSql =
            "UPDATE kullanicilar SET durum = 1 WHERE kullanici_id = ?";
          const [userRows, userFields] = await pool.query(userSql, [id]);
          if (userRows.affectedRows) {
            const { rol } = check[0];
            let roleSql;
            if (rol === "Anketör") {
              roleSql = "INSERT INTO anketör (kullanici_id) VALUES (?)";
            } else if (rol === "Planlayıcı") {
              roleSql = "INSERT INTO planlamaci (kullanici_id) VALUES (?)";
            } else if (rol === "Yönetici") {
              roleSql = "INSERT INTO yönetici (kullanici_id) VALUES (?)";
            }
            await pool.query(roleSql, [id]);
            return res.json({
              message:
                "Kullanıcının durumu güncellendi ve rol tablosuna eklendi.",
            });
          } else {
            return res.json({
              error: "Kullanıcının durumunu güncelleme başarısız oldu.",
            });
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
        error: error.message,
      });
    }
  },
  getTaskCreate: async (req, res) => {
    try {
      // Anketörlerin isimlerini çek
      const [anketorler] = await pool.query(
        "SELECT a.kullanici_id, k.isim FROM anketör a INNER JOIN kullanicilar k ON a.kullanici_id = k.kullanici_id WHERE a.yapilacak_is IS NULL"
      );
      const pollsters = anketorler.map(
        (anketor) => `Id:${anketor.kullanici_id}, ismi: ${anketor.isim}`
      );

      // Şablonların isimlerini çek
      const [sablonlar] = await pool.query("SELECT sablon_id, baslik FROM sablon");
      const templates = sablonlar.map((sablon) => ({ sablon_id: sablon.sablon_id, baslik: sablon.baslik }));

      // Sonuçları döndür
      return res.json({
        sablonlar: templates,
        pollsters: pollsters,
      });
    } catch (error) {
      console.log(error);
      res.json({
        error: error.message,
      });
    }
  },
  taskCreate: async (req, res) => {
    try {
      const {
        city,
        district,
        endDate,
        numberOfSurveys,
        percentageOfWomen,
        pollster,
        startDate,
        template,
        template_title,
        title,
      } = req.body;

      // Parse the pollster id from the pollster string
      const pollsterId = pollster.split(":")[1];
      const pollsterIdFixed = pollsterId.split(",")[0];
      console.log(pollsterIdFixed);

      // Get the pollster's name
      const [pollsterInfo] = await pool.query(
        "SELECT k.isim FROM kullanicilar k WHERE k.kullanici_id = ?",
        [pollsterId]
      );
      const pollsterName = pollsterInfo[0].isim;


        // il_adı'nın karşılık gelen il_id'sini bul
      const [cityRows, cityFields] = await pool.query(
        "SELECT il_id FROM iller WHERE il_adi = ?",
        [city]
      );

      const il_id = cityRows[0].il_id;

      // il ve ilçe'nin daha önce girilip girilmediğini kontrol et
      const [locationRows, locationFields] = await pool.query(
        "SELECT konum_id FROM konum WHERE il_id = ? AND ilçe = ?",
        [il_id, district]
      );
      let konum_id;
      if (locationRows.length > 0) {
        konum_id = locationRows[0].konum_id;
      } else {
        // Yeni konum_id oluştur ve konum tablosuna ekle
        const locationSql = "INSERT INTO konum (il_id, ilçe) VALUES (?, ?)";
        const [locationInsertRows, locationInsertFields] = await pool.query(
          locationSql,
          [il_id, district]
        );
        konum_id = locationInsertRows.insertId;
      }

      // Insert the new task into the database
      const insertQuery = `
            INSERT INTO iş (anket_sayisi, baslangic_tarihi, bitis_tarihi, belirlenen_sablon, is_basligi, kadin_orani, konum_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)`;

      const insertValues = [
        numberOfSurveys,
        startDate,
        endDate,
        template,
        title,
        percentageOfWomen,
        konum_id,
      ];

      const insertRows = await pool.query(insertQuery, insertValues);

      // Get the newly inserted task's ID
      const taskIdQuery = "SELECT * FROM iş ORDER BY is_id DESC LIMIT 1";
      const [taskIdResult] = await pool.query(taskIdQuery);
      const taskId = taskIdResult[0].is_id;

      // Update the pollster's yapilacak_is field
      const updatePollsterQuery =
        "UPDATE anketör SET yapilacak_is = ? WHERE kullanici_id = ?";
      const updatePollsterValues = [taskId, pollsterIdFixed];

      await pool.query(updatePollsterQuery, updatePollsterValues);

      // Return success response
      return res.json({
        message: "Task created successfully",
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({
        error: error.message,
      });
    }
  },
  getTasks: async (req, res) => {
    try {
      const taskQuery = `
        SELECT
          is_id, is_basligi, anket_sayisi, baslangic_tarihi, bitis_tarihi, konum_id, durum
        FROM iş`;
  
      const [taskResults] = await pool.query(taskQuery);
  
      const tasksData = [];
  
      for (const taskResult of taskResults) {
        const {
          is_id: taskId,
          is_basligi: taskName,
          anket_sayisi: numberOfSurveys,
          baslangic_tarihi: startingDate,
          bitis_tarihi: endingDate,
          konum_id: locationId,
          durum: status,
        } = taskResult;
  
        const locationQuery = `
          SELECT
            iller.il_adi,
            konum.ilçe
          FROM
            iş
          JOIN
            konum ON iş.konum_id = konum.konum_id
          JOIN
            iller ON konum.il_id = iller.il_id
          WHERE
            iş.konum_id = ?
        `;
        

        const [locationResult] = await pool.query(locationQuery, [locationId]);
  
        const city = locationResult[0].il_adi;
        const district = locationResult[0].ilçe;

        pollsterNameQuery = `SELECT kullanicilar.isim
            FROM iş
            JOIN anketör ON iş.is_id = anketör.yapilacak_is
            JOIN kullanicilar ON anketör.kullanici_id = kullanicilar.kullanici_id
            WHERE iş.is_id = ?`;
        
        console.log('pollsterIdQuery:', pollsterNameQuery, 'taskId:', taskId);
        
        const[pollsterTemp] = await pool.query(pollsterNameQuery, [taskId]);
        console.log(pollsterTemp);
        
        let pollsterName = null;
          
        if (pollsterTemp.length > 0) {
            pollsterName = pollsterTemp[0].isim;
          }
  
        const taskData = {
          taskId,
          taskName,
          numberOfSurveys,
          startingDate,
          endingDate,
          city,
          district,
          pollsterName,
          status,
        };
  
        tasksData.push(taskData);
      }
  
      console.log(tasksData);
      return res.json(tasksData);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },
  setPoll: async (req, res) => {
    
    try {
      const  {
        participant,
        taskId,
        questions
      } = req.body

      const participantQuery = "INSERT INTO katilimcilar(isim, soyisim, cinsiyet) VALUES (?, ?, ?)"
      const [participantRows, participantFields] = await pool.query(participantQuery, [participant.name, participant.surname, participant.gender]);

      if (!participantRows.affectedRows){
        return res.json({error:"Katılımcı oluşturulamadı."})
      }

      const participantId = participantRows.insertId;
      console.log(participantId);


      const pollQuery = "INSERT INTO anket (is_id, katilimci_id, yapilma_tarihi) VALUES (?, ?, ?)"
      const [pollQueryRows, pollQueryFields] = await pool.query(pollQuery, [taskId, participantId, new Date()]);
      
      if (!pollQueryRows.affectedRows){
        return res.json({error:"Anket oluşturulamadı."})
      }

      const answersQuery = "INSERT INTO cevaplar (cevap, soru_id) VALUES (?, ?)";
    
      for (const question of questions) {
          const [answersRows, answersFields] = await pool.query(answersQuery, [question.answer, question.id]);
          
          if (!answersRows.affectedRows) {
              return res.json({ error: "Cevap eklenemedi!" });
          }
      }
      return res.json({message:"Anket başarıyla eklendi."})

    }
    catch(err){
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

};


module.exports = authController;
