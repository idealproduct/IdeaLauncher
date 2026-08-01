import express from "express";
import { Server } from "http";
import open from "open";

import { MicrosoftAuth } from "./MicrosoftAuth";

const PORT = 25555;


export class OAuthServer {

    private server?: Server;

    private auth: MicrosoftAuth;


    constructor() {

        this.auth = new MicrosoftAuth();

    }



    async login() {

        return new Promise(async (resolve, reject) => {


            const app = express();



            this.server = app.listen(
                PORT,
                async () => {

                    console.log(
                        `OAuth server running on ${PORT}`
                    );


                    const url =
                        await this.auth.getLoginUrl();


                    await open(url);

                }
            );



            app.get(
                "/auth",
                async (req, res) => {

                    try {

                        const code =
                            req.query.code as string;


                        if (!code) {

                            throw new Error(
                                "No authorization code"
                            );

                        }



                        res.send(`
                            <html>
                            <body>
                                <h2>
                                Minecraft login success.
                                You can close this window.
                                </h2>
                            </body>
                            </html>
                        `);



                        const account =
                            await this.auth.login(code);



                        this.close();



                        resolve(account);


                    }
                    catch(error) {

                        reject(error);

                    }

                }
            );


        });

    }



    close() {

        if(this.server) {

            this.server.close();

            this.server = undefined;

        }

    }

}