import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { timeStamp } from "node:console";

const app = express();

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

app.get('/health',(req, res) => {
    res.status(200).json({
        status: "OK",
        service: "UptimeHub Health API",
        timeStamp: new Date().toISOString()
    })
});

export default app;