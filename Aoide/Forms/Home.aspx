<%@ Page Language="C#" AutoEventWireup="true" CodeBehind="Home.aspx.cs" Inherits="Aoide.Forms.Home" %>

<!DOCTYPE html>

<html xmlns="http://www.w3.org/1999/xhtml">
<head runat="server">
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous" />
    <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.6.1/css/font-awesome.min.css" rel="stylesheet" />
    <link href='https://fonts.googleapis.com/css?family=Lexend' rel='stylesheet' />
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
    <link rel="stylesheet" href="https://cdn.materialdesignicons.com/5.4.55/css/materialdesignicons.min.css" />
    <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkStyles" href="~/Styles/Main.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkNavBar" href="~/Styles/NavBar.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSlider" href="~/Styles/splide-teal.min.css" />
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>MediaBinger - Home</title>
</head>
<body">
    <form id="form1" runat="server">
        <div id="nav-placeholder"></div>
        <br />
        <div id="menContainer" runat="server" class="menu-box" style="padding-left: 30px; padding-top: 15px">
        </div>
        <asp:ScriptManager ID="ScriptManager1" runat="server"
            EnablePageMethods="true">
        </asp:ScriptManager>
    </form>

    <script src="https://code.jquery.com/jquery-3.6.0.js" integrity="sha256-H+K7U5CnXl1h5ywQfKtSj8PCmoN9aaq30gDh27Xc0jk=" crossorigin="anonymous"></script>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
    <script src="/JS/Navbar.js" type="text/javascript"></script>
    <script src="/JS/Menu.js" type="text/javascript"></script>
    <script src="/JS/Splide.min.js"></script>
    
    <script src="https://code.jquery.com/ui/1.12.1/jquery-ui.js" integrity="sha256-T0Vest3yCU7pafRw9r+settMBX6JkKN06dqBnpQ8d30=" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js" integrity="sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1" crossorigin="anonymous"></script>
    <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha384-JjSmVgyd0p3pXB1rRibZUAYoIIy6OrQ6VrjIEaFf/nJGzIxFDsf4x0xIM+B07jRM" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-datepicker/1.9.0/js/bootstrap-datepicker.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
    

    <script>
        var HeartBeatTimer;

        function StartHeartBeat() {
            // pulse every 5 seconds
            if (HeartBeatTimer == null)
                HeartBeatTimer = setInterval("HeartBeat()", 1000 * 30);
        }

        function HeartBeat() {
            $.ajax({
                type: "POST",
                async: false,
                url: "/Forms/PrimaryPage.aspx/PokePage",
                data: JSON.stringify({
                }),
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                success: function (data) {
                }
            });
        }

        StartHeartBeat();
    </script>
</body>
</html>
