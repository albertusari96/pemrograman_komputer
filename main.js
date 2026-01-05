const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const cors = require("cors");
const PDFDocument = require('pdfkit');

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));

// set sesion user
app.use(session({
    secret: "secret123",
    resave: false,
    saveUninitialized: true
}));

// koneksi DB
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    // password: "",
    database: "dbku",
    port: 3306
});

db.connect(err => {
    if(err) throw err;
    console.log("Database connected!");
});

app.set('view engine', 'ejs');
app.set('views', './views');

app.use(cors());

// load static file
app.use(express.static(path.join(__dirname, 'public')));

// route login page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views/login.html"));
});


app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const sql = "SELECT * FROM users WHERE username=? AND password=?";
  db.execute(sql, [username, password], (err, results) => {
      if(err) throw err;

      if(results.length > 0){
          req.session.user = username;
          res.redirect("/dashboard");
      } else {
          res.send("Login gagal");
      }
  });
});

// route dashboard
app.get("/dashboard", (req, res) => {
  if(req.session.user){
    res.sendFile(path.join(__dirname, "views/dashboard.html"));
  } else {
    res.redirect("/");
  }
});

app.get("/galeri", (req, res) => {
  if(req.session.user){
    res.sendFile(path.join(__dirname, "views/galeri.html"));
  } else {
    res.redirect("/");
  }
});

app.get("/jadkul", (req, res) => {
   if (!req.session.user) {
    return res.redirect("/");
  }

  let sql = "SELECT * FROM matkul "
  let {hari} = req.query;
  let params = [];

  if (hari) {
    sql += 'Where hari = ?';
    params.push(hari);
  }

  db.query(sql, params, (err, rows) => {
    if (err) throw err;

    const matkul = rows.map(item => {
      return {
        ...item
      }
    })
      res.render("jadkul", {
        user: req.session.user,
        matkul,
        hari: hari || ''
  })

  })
});

app.get('/absensi', (req, res) => {
    // Ambil hari ini
    const hariMap = [
        'Minggu',
        'Senin',
        'Selasa',
        'Rabu',
        'Kamis',
        'Jumat',
        'Sabtu'
    ];
    const hariIni = hariMap[new Date().getDay()];

    // QUERY 1: Matkul hari ini
    const matkulQuery = `
        SELECT id_matkul, mata_kuliah, jam, total_pertemuan
        FROM matkul
        WHERE hari = ?
    `;

    // QUERY 2: Riwayat absensi
    const absensiQuery = `
        SELECT 
            m.id_matkul,
            m.mata_kuliah,
            m.total_pertemuan,
            a.tanggal,
            a.pertemuan_ke,
            a.status,
            SUM(a.status = 'Hadir')
                OVER (PARTITION BY m.id_matkul) AS jumlah_hadir
        FROM absensi a
        JOIN matkul m ON a.id_matkul = m.id_matkul
        ORDER BY a.tanggal DESC
    `;

    // QUERY 3: Rekap persentase 
    const presentaseQuery = `
        SELECT
            m.id_matkul,
            m.mata_kuliah,
            m.total_pertemuan,
            COUNT(a.id_absensi) AS pertemuan_tercatat,
            SUM(CASE WHEN a.status = 'Hadir' THEN 1 ELSE 0 END) AS jumlah_hadir,
            ROUND(
                (SUM(CASE WHEN a.status = 'Hadir' THEN 1 ELSE 0 END) / m.total_pertemuan) * 100,
                2
            ) AS persentase_kehadiran
        FROM matkul m
        LEFT JOIN absensi a ON a.id_matkul = m.id_matkul
        GROUP BY m.id_matkul, m.mata_kuliah, m.total_pertemuan
    `;

    db.query(matkulQuery, [hariIni], (err, matkulHariIni) => {
        if (err) {
            console.error(err);
            return res.sendStatus(500);
        }

        db.query(absensiQuery, (err, riwayatAbsensi) => {
            if (err) {
                console.error(err);
                return res.sendStatus(500);
            }

            db.query(presentaseQuery, (err, dataPresentase) => {
                if (err) {
                    console.error(err);
                    return res.sendStatus(500);
                }

                const dataAbsensi = riwayatAbsensi.map(row => {
                    const persentase = row.total_pertemuan
                        ? Math.round((row.jumlah_hadir / row.total_pertemuan) * 100)
                        : 0;

                    return {
                        ...row,
                        tanggalFormatted: formatTanggalIndonesia(row.tanggal),
                        persentase
                    };
                });

                res.render('absensi', {
                    hariIni,
                    matkulHariIni,
                    riwayatAbsensi: dataAbsensi,
                    dataPresentase
                });
            });
        });
    });
});


app.post('/absensi', (req, res) => {
    const { id_matkul, status } = req.body;
    const tanggal = new Date();

    const hitungPertemuan = `
        SELECT COUNT(*) AS total
        FROM absensi
        WHERE id_matkul = ?
    `;

    db.query(hitungPertemuan, [id_matkul], (err, result) => {
        if (err) throw err;

        const pertemuanKe = result[0].total + 1;

        const insertAbsensi = `
            INSERT INTO absensi (id_matkul, tanggal, pertemuan_ke, status)
            VALUES (?, ?, ?, ?)
        `;

        db.query(insertAbsensi, [
            id_matkul,
            tanggal,
            pertemuanKe,
            status
        ], (err) => {
            if (err) throw err;
            res.redirect('/absensi');
        });
    });
});


app.get('/pembayaran', (req, res) => {
    const query = `SELECT * FROM pembayaran ORDER BY bayar_ke`;

    db.query(query, (err, pembayaran) => {
        if (err) throw err;

        const dataPembayaran = pembayaran.map(row => ({
            ...row,
            tanggal_bayar_formatted: formatTanggalIndonesia(row.tanggal_bayar)
        }));

        res.render('pembayaran', { 
          pembayaran: dataPembayaran
         });
    });
});

app.get('/pembayaran/download/:id', (req, res) => {
    const id = req.params.id;

    const query = `SELECT * FROM pembayaran WHERE id_pembayaran = ?`;

    db.query(query, [id], (err, result) => {
        if (err) {
            console.error(err);
            return res.sendStatus(500);
        }

        if (result.length === 0) {
            return res.sendStatus(404);
        }

        const p = result[0];

        const doc = new PDFDocument({ margin: 50 });

        // Header response
        res.setHeader(
            'Content-Disposition',
            `attachment; filename=bukti_pembayaran_${p.bayar_ke}.pdf`
        );
        res.setHeader('Content-Type', 'application/pdf');

        doc.pipe(res);

        // ===== ISI PDF =====
        doc.fontSize(16)
           .text('BUKTI PEMBAYARAN', { align: 'center' });

        doc.moveDown(2);

        doc.fontSize(12)
           .text(`Bayar Ke       : ${p.bayar_ke}`)
           .text(`Item Biaya     : ${p.item_biaya}`)
           .text(`Nilai Bayar    : Rp ${Number(p.nilai_bayar).toLocaleString('id-ID')}`)
           .text(`Tanggal Bayar  : ${p.tanggal_bayar}`)
           .text(`Keterangan     : ${p.keterangan || '-'}`);

        doc.moveDown(2);
        doc.text('Tanda Tangan', { align: 'right' });
        doc.text('(____________________)', { align: 'right' });

        doc.end();
    });
});



app.get('/kontak', (req, res) => {
    res.render('kontak', {
        success: req.query.success
    });
});

app.post('/kontak', (req, res) => {
    const { nama, email, subject, pesan } = req.body;

    const query = `
        INSERT INTO kontak (nama, email, subject, pesan)
        VALUES (?, ?, ?, ?)
    `;

    db.query(query, [nama, email, subject, pesan], (err) => {
        if (err) {
            console.error(err);
            return res.sendStatus(500);
        }

        res.redirect('/kontak?success=1');
    });
});



function formatTanggalIndonesia(date) {
    const hari = [
        'Minggu', 'Senin', 'Selasa',
        'Rabu', 'Kamis', 'Jumat', 'Sabtu'
    ];

    const bulan = [
        'Januari', 'Februari', 'Maret',
        'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September',
        'Oktober', 'November', 'Desember'
    ];

    const d = new Date(date);

    return `${hari[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}


exports.generateBuktiPembayaran = (pembayaran, res) => {
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader(
        'Content-Disposition',
        `attachment; filename=bukti_pembayaran_${pembayaran.bayar_ke}.pdf`
    );
    res.setHeader('Content-Type', 'application/pdf');

    doc.pipe(res);

    doc.fontSize(16).text('BUKTI PEMBAYARAN', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12)
        .text(`Bayar Ke       : ${pembayaran.bayar_ke}`)
        .text(`Item Biaya     : ${pembayaran.item_biaya}`)
        .text(`Nilai Bayar    : Rp ${pembayaran.nilai_bayar.toLocaleString('id-ID')}`)
        .text(`Tanggal Bayar  : ${pembayaran.formatTanggalIndonesia(tanggal_bayar)}`)
        .text(`Keterangan     : ${pembayaran.keterangan || '-'}`);

    doc.end();
};




app.listen(3000, () => console.log("Server berjalan di http://localhost:3000"));
