require("dotenv").config();
require("../config/db.config").applyDnsServers();

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const User = require("../models/User");

const createSuperAdmin = async () => {
  try {
    if (!process.env.MONGO_DB_URL) {
      throw new Error("MONGO_DB_URL is not defined in .env");
    }

    await mongoose.connect(process.env.MONGO_DB_URL);

    // Credentials ab .env se (code mein hard-coded password nahi)
    const email = (process.env.SUPER_ADMIN_EMAIL || "admin@travelprot.com").toLowerCase();
    const password = process.env.SUPER_ADMIN_PASSWORD;

    if (!password || password.length < 8) {
      throw new Error("SUPER_ADMIN_PASSWORD (min 8 chars) is not defined in .env");
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log("Super Admin already exists");
      await mongoose.disconnect();
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await User.create({
      firstName: "Super",
      lastName: "Admin",
      email,
      password: hashedPassword,
      role: null,
      isSuperAdmin: true,
      isActive: true,
    });

    console.log("Super Admin created successfully");
    console.log("Email:", email);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Create Super Admin Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

createSuperAdmin();
