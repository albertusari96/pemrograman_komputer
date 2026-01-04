const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const cors = require("cors");

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
    password: "",
    database: "PemrogramanKomputer",
    port: 3306
});

db.connect(err => {
    if(err) throw err;
    console.log("Database connected!");
});

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
  if(req.session.user){
    res.sendFile(path.join(__dirname, "views/jadkul.html"));
  } else {
    res.redirect("/");
  }
});

app.get("/absensi", (req, res) => {
  if(req.session.user){
    res.sendFile(path.join(__dirname, "views/absensi.html"));
  } else {
    res.redirect("/");
  }
});

app.get("/pembayaran", (req, res) => {
  if(req.session.user){
    res.sendFile(path.join(__dirname, "views/pembayaran.html"));
  } else {
    res.redirect("/");
  }
});

app.get("/kontak", (req, res) => {
  if(req.session.user){
    res.sendFile(path.join(__dirname, "views/kontak.html"));
  } else {
    res.redirect("/");
  }
});



app.listen(3000, () => console.log("Server berjalan di http://localhost:3000"));
