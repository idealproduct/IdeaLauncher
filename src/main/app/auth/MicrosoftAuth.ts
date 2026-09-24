import { PublicClientApplication, Configuration } from "@azure/msal-node";
import { MicrosoftAuthenticator } from "@xmcl/user/dist/index.js";

const CLIENT_ID = "f930789e-31a6-4b74-9ef3-cb3939f7f0dd";

const config: Configuration = {
    auth: {
        clientId: CLIENT_ID,
        authority:
            "https://login.microsoftonline.com/consumers",
    },
};


export interface MinecraftAccount {

    id: string;

    username: string;

    minecraftAccessToken: string;

    expiresIn: number;

    expiresAt?: number;

    xboxXuid: string;

    xboxUhs: string;

    avatar?: string;

}


export class MicrosoftAuth {

    private msal: PublicClientApplication;

    private xmcl: MicrosoftAuthenticator;


    constructor() {

        this.msal =
            new PublicClientApplication(config);


        this.xmcl =
            new MicrosoftAuthenticator();

    }



    /**
     * 取得 Microsoft 登入網址
     */
    async getLoginUrl() {

        return await this.msal.getAuthCodeUrl({

            scopes: [
                "XboxLive.signin",
                "offline_access",
            ],

            redirectUri:
                "http://localhost:25555/auth",

            prompt: "select_account",

        });

    }



    /**
     * 使用 Microsoft code 登入
     */
    async login(code: string): Promise<MinecraftAccount> {


        const result =
            await this.msal.acquireTokenByCode({

                code,

                scopes: [
                    "XboxLive.signin",
                    "offline_access",
                ],

                redirectUri:
                    "http://localhost:25555/auth",

            });



        if (!result?.accessToken) {

            throw new Error(
                "Microsoft access token missing"
            );

        }



        /*
            Microsoft Token
                    |
                    v
            Xbox Token
        */

        const xbox =
            await this.xmcl.acquireXBoxToken(
                result.accessToken
            );



        const minecraftXsts =
            xbox.minecraftXstsResponse;



        const xboxUser =
            minecraftXsts.DisplayClaims.xui[0];



        /*
            Xbox Token
                    |
                    v
            Minecraft Token
        */

        const minecraft =
            await this.xmcl.loginMinecraftWithXBox(

                xboxUser.uhs,

                minecraftXsts.Token

            );

        const profileResponse = await fetch(
            "https://api.minecraftservices.com/minecraft/profile",
            {
                headers: {
                    Authorization: `Bearer ${minecraft.access_token}`,
                },
            }
        );

        if (!profileResponse.ok) {
            throw new Error("Unable to get Minecraft profile");
        }

        const profile = await profileResponse.json();




        return {

            id: profile.id,

            username:
                profile.name,


            minecraftAccessToken:
                minecraft.access_token,


            expiresIn:
                minecraft.expires_in,


            xboxXuid:
                xboxUser.xid,


            xboxUhs:
                xboxUser.uhs,


        };

    }

}
