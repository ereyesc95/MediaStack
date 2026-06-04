<%@ Page Language="C#" AutoEventWireup="true" CodeBehind="ItemRegistration.aspx.cs" Inherits="Aoide.Forms.ItemRegistration" %>

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
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSectionBar" href="~/Styles/SectionBar.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSlider" href="~/Styles/splide-teal.min.css" />
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>MediaBinger - Write Data</title>
</head>
<body>
    <form id="form1" runat="server">
        <div class="innerDiv container" id="divRegData" style="margin-top: 5%; font-size: 17px;">
            <div id="divTitle" runat="server">
                <span id="titleEntity" class="labelField modalSpan" style="font-weight: bold">Entity Not Found</span>
            </div>
            <br />
            <div id="divCheckCode" runat="server" style="margin-top: -15px">
                <p class="labelField">This window will allow you to register new entities.</p>
                <br />
                <asp:Button ID="butEntityYes" runat="server" Text="Continue" CssClass="modalButton btn" OnClick="Add_Code" Style="float: right" />
            </div>
            <div id="divInsertCode" runat="server" style="display: none; bottom: 10px; margin-top: -15px">
                <p class="labelField">Insert code for <a id="EntitySourceLink" class="anchorLink" href="javascript:void(0)" target="_blank" runat="server">this entity</a></p>
                <input id="itmCode" type="text" name="itmCode" class="form-control inputField input-sm dark-mode-secondary" placeholder="Entity ID" runat="server" />
                <asp:Button ID="butEntityNext" runat="server" Text="Finish" CssClass="modalButton btn" OnClick="Submit_Code" Style="float: right" />
            </div>
            <div id="divWait" runat="server" style="display: none; margin-top: 15px">
                <p id="pWait" runat="server" class="labelField">Please wait...</p>
            </div>
            <div id="divCloseModal" runat="server" style="display: none; margin-top: 15px">
                <p id="pAddText" runat="server" class="labelField">All set! Please click anywhere to continue.</p>
            </div>
    </form>
    <script src="https://code.jquery.com/jquery-3.6.0.js" integrity="sha256-H+K7U5CnXl1h5ywQfKtSj8PCmoN9aaq30gDh27Xc0jk=" crossorigin="anonymous"></script>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
    <script src="/JS/Navbar.js" type="text/javascript"></script>
    <script src="/JS/SectionBar.js" type="text/javascript"></script>
    <script src="/JS/Splide.min.js"></script>
    
    <script src="https://code.jquery.com/ui/1.12.1/jquery-ui.js" integrity="sha256-T0Vest3yCU7pafRw9r+settMBX6JkKN06dqBnpQ8d30=" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js" integrity="sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1" crossorigin="anonymous"></script>
    <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha384-JjSmVgyd0p3pXB1rRibZUAYoIIy6OrQ6VrjIEaFf/nJGzIxFDsf4x0xIM+B07jRM" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-datepicker/1.9.0/js/bootstrap-datepicker.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
    
    <script>


</script>
</body>
</html>
