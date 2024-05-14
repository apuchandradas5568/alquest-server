import express from "express";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

const app = express();
dotenv.config();
app.use(cookieParser());

const PORT = process.env.PORT || 5050;

app.use(
  cors({
    origin: [
      "https://alquest-b253e.web.app",
      "https://alquest-b253e.firebaseapp.com",
      "http://localhost:5173",
    ],
    credentials: true,
  })
);

app.use(express.json());

const client = new MongoClient(process.env.MONGO, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


async function run() {
  try {
    await client.connect();
    const database = client.db("ass11");
    const recommendationsCollection = database.collection("Recommendation");
    const queryCollection = database.collection("Query");
    console.log("Database connected");

    // services api
    app.post("/jwt", async (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.JWT_SECRET, {
        expiresIn: "30d",
      });
      res.cookie("userToken", token, {
        secure: true,
        httpOnly: true,
        sameSite: "none",
      });
      //   console.log(token);
      res.json({ token });
    });

    const verifyToken = (req, res, next) => {
      const authHeader = req.cookies.userToken;
      // console.log(authHeader);
      const decoded = jwt.verify(authHeader, process.env.JWT_SECRET);
      console.log(decoded);
      req.token = decoded;
      next();
    };

    // adding recommendation routes
    app.post("/recommendation/add", async (req, res) => {
      const recommendation = req.body;
      await queryCollection.findOneAndUpdate(
        { _id: new ObjectId(recommendation.queryId) },
        {
          $inc: { recommendationCount: 1 },
        }
      );

      const result = await recommendationsCollection.insertOne(recommendation);
      res.json(result);
    });

    app.get("/recommendation/all", verifyToken, async (req, res) => {
      const { email } = req.token;
      console.log(email);
      const result = await recommendationsCollection
        .find({ recommenderEmail: email })
        .sort({ _id: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/recommendation/foruser", verifyToken, async (req, res) => {
      const { email } = req.token;
      console.log(email);
      const result = await recommendationsCollection
        .find({ recommenderEmail: { $not: { $eq: email } } })
        .sort({ _id: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/recommendation/all/:queryId", async (req, res) => {
      const queryId = req.params.queryId;
      const cursor = recommendationsCollection
        .find({ queryId })
        .sort({ _id: -1 });

      try {
        const result = await cursor.toArray();
        res.json(result);
      } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.get("/recommendation/:id", async (req, res) => {
      const recommendationId = req.params.id;
      const query = { _id: new ObjectId(recommendationId) };
      const result = await recommendationsCollection
        .findOne(query)
        .sort({ _id: -1 });
      res.send(result);
    });

    app.delete("/recommendation/:id", verifyToken, async (req, res) => {
      if (!req.token) {
        return res.status(401).json("You need to Login");
      }

      const recommendationId = req.params.id;
      const query = { _id: new ObjectId(recommendationId) };

      if (
        req.token.email !==
        (await recommendationsCollection.findOne(query)).recommenderEmail
      ) {
        return res
          .status(401)
          .json("You are not authorized to delete this recommendation");
      }
      await recommendationsCollection.findOneAndDelete(query);

      res.send("Deleted");
    });

    // adding query routes
    app.post("/query/add", verifyToken, async (req, res) => {
      const user = req.token;
      const query = req.body;
      console.log(query);
      const { iat, exp, ...modifiedUser } = user;
      const newQuery = {
        ...query,
        ...modifiedUser,
        recommendationCount: 0,
        timestamp: new Date(),
      };
      try {
        const result = await queryCollection.insertOne(newQuery);
        res.json(result);
      } catch (error) {
        console.log(error);
      }
    });

    app.get("/query", async (req, res) => {
      const { limit, productName } = req.query;

      let regexPattern = "(?:)";

      if (productName) {
        regexPattern = new RegExp(productName.split(" ").join("|"), "i");
      }

      // const filter =

      const cursor = queryCollection
        .find({ productName: { $regex: regexPattern } })
        .sort({ timestamp: -1 })
        .limit(parseInt(limit));

      const result = await cursor.toArray();

      res.send(result);
    });

    app.get("/query/all", verifyToken, async (req, res) => {
      const user = req.token;
      const result = await queryCollection
        .find({ email: user.email })
        .sort({ timestamp: -1 })
        .toArray();
      res.json(result);
    });

    app.get("/query/:id", async (req, res) => {
      const queryId = req.params.id;
      const query = { _id: new ObjectId(queryId) };
      const result = await queryCollection.findOne(query);
      res.json(result);
    });

    app.delete("/query/:id", verifyToken, async (req, res) => {
      const queryId = req.params.id;
      const user = req.token;
      const query = { _id: new ObjectId(queryId) };
      user && (await queryCollection.findOneAndDelete(query));
      res.send("Deleted");
    });

    app.put("/query/:id", async (req, res) => {
      const queryId = req.params.id;
      console.log(req.body);
      const query = { _id: new ObjectId(queryId) };
      await queryCollection.findOneAndUpdate(query, {
        $set: req.body,
      });
      res.send("Updated Successfully");
    });


    app.post("/logout", (req, res) => {
      res.clearCookie("userToken");
      res.send("Logged out successfully");
    });
  } catch (error) {}
}

run().catch(console.dir);

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
