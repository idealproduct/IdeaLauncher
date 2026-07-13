using CmlLib.Core.Auth;
using CmlLib.Core.Auth.Microsoft;
using CmlLib.Core.Auth.Microsoft.Authenticators;
using Microsoft.Identity.Client;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using XboxAuthNet.Game.Msal;
using XboxAuthNet.Game.Msal.OAuth;

namespace IdeaLauncher.Services;

public class AuthService
{
    private readonly string _clientId;

    public JELoginHandler loginHandler;

    public AuthService(string clientId)
    {
        _clientId = clientId;

    }

    public async Task<MSession> AuthnticateAsync()
    {

        try
        {
            return await loginHandler.AuthenticateSilently();
        }
        catch
        {
            return await loginHandler.AuthenticateInteractively();
        }
    }

    public async Task<MSession> AuthLogin()
    {
        var app = await MsalClientHelper.BuildApplicationWithCache(_clientId);
        var loginHandler = new JELoginHandlerBuilder().WithOAuthProvider(new MsalCodeFlowProvider(app)).Build();
        var session = await loginHandler.Authenticate();

        return session;

        //return await loginHandler.AuthenticateInteractively();
    }

    

}
