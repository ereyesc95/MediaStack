<%@ Page Language="C#" AutoEventWireup="true" CodeBehind="UserRegistry.aspx.cs" Inherits="MediaBinger.Forms.UserRegistry" %>

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
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSlider" href="~/Styles/splide-teal.min.css" />
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title></title>
</head>
<body id="modbody" runat="server" >
    
    <form id="form1" runat="server">
        <asp:ScriptManager ID="ScriptManager1" runat="server" EnablePageMethods="True">
    </asp:ScriptManager>
        <div class="form-inline" style="margin-left: -6%;">
            <div class="col-6 vertical-center div" id="divUserPicture">
                <asp:FileUpload ID="usrImage" runat="server" name="usrImage" class="form-control inputField inputImage" Style="display: none"></asp:FileUpload>
                <img id="usrPreview" class="picturePreview centered systemImage" src="/Images/System/user.jpg" alt="userImage" style="width: 110%; margin-top: -5%; margin-bottom: 0" />
                <div id="addProfilePic" class="addPicture vertical-center" style="cursor: pointer; display:none; margin-left:25%; border-style: dashed; padding:30px; border-radius: 25px;">
                    <span style="padding-top:500px">Click to add picture <i class="fa fa-camera"></i></span>
                </div>
            </div>
            <div class="col-6 vertical-center div" id="divUserData" style="margin-left: 50%; margin-top: 3%">
                <div class="splide col-12">
                    <div class="splide__track">
                        <ul class="splide__list">
                            <li class="splide__slide">
                                <div class="col form-inline innerDiv" id="divAccountData">
                                    <span class="modalSpan">Account Data</span>
                                    <input id="usrName" type="text" name="usrName" class="form-control inputField input-lg" placeholder="Username" value="" />
                                    <span id="spanUser" class="spanCheck" style="font-size:10px;color:mediumvioletred;margin-top:-10px;display:none"></span>
                                    <input id="usrMail" type="email" name="usrMail" class="form-control inputField input-lg" placeholder="Email" />
                                    <span id="spanMail" class="spanCheck" style="font-size:10px;color:mediumvioletred;margin-top:-10px;display:none"></span>
                                    <input id="usrPassword" type="password" name="usrPassword" class="form-control inputField input-lg passField" placeholder="Password" />
                                    <input id="usrRepPassword" type="password" name="usrRepPassword" class="form-control inputField input-lg passField" placeholder="Repeat Password" />
                                    <span id="spanPassword" class="spanCheck" style="font-size:10px;color:mediumvioletred;margin-top:-20px;display:none;position: absolute;">Passwords don't match</span>
                                    <select id="usrRole" name="usrRole" runat="server" class="form-control inputField input-lg select2">
                                        <option value="NaN" disabled="disabled">Role</option>
                                    </select>
                                </div>
                            </li>
                            <li class="splide__slide ">
                                <div class="col form-inline innerDiv" id="divPersonalData">
                                    <span class="modalSpan">Personal Data</span>
                                    <input id="usrFirstName" type="text" name="usrFirstName" class="form-control inputField input-lg" placeholder="First Name" />
                                    <input id="usrLastName" type="text" name="usrLastName" class="form-control inputField input-lg" placeholder="Last Name" />
                                    <div class="form-inline">
                                        <input id="usrBirthDate" type="text" name="usrBirthDate" class="form-control inputField input-lg selectIcons" placeholder="Birthdate" style="cursor: pointer" />
                                        <i class="fa fa-calendar" style="font-size: 18px; margin-left: -25px; cursor: pointer"></i>
                                    </div>
                                    <select id="selCountry" name="selCountry" runat="server" class="select2 inputField input-lg ">
                                        <option value="NaN">DisOption;flag; Country</option>
                                    </select>
                                    
                                    <select id="usrGender" name="usrGender" runat="server" class="select2 inputField input-lg ">
                                        <option value="NaN">DisOption;venus-mars; Gender</option>
                                    </select>
                                    <select id="selContinent" name="selContinent" runat="server" class="select2 inputField input-lg" style="display:none">
                                    </select>
                                    <select id="selContinentBck" name="selContinentBck" runat="server" class="select2 inputField input-lg" style="display:none">
                                    </select>
                                    <div class="form-inline col submitButton">
                                        <asp:Button ID="submit" runat="server" Text="Submit" CssClass="btn btn-success" OnClick="submit_Click" />
                                        <asp:Button ID="retrieve" runat="server" Text="Edit user" class="btn btn-info" OnClick="retrieve_Click" />
                                        
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="form-inline container" id="buttonsContainer" style="text-align: center">

                <div class="form-inline col">
                    <a href="javascript:void(0)" id="colorMode" class="btn btn-info" style="display:none" >Toggle dark mode</a>
                </div>
                
            </div>
        </div>
    </form>
    <script src="https://code.jquery.com/jquery-3.6.0.js" integrity="sha256-H+K7U5CnXl1h5ywQfKtSj8PCmoN9aaq30gDh27Xc0jk=" crossorigin="anonymous"></script>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
    <script src="/JS/Registry.js" type="text/javascript"></script>
    <script src="/JS/Splide.min.js"></script>
    
    <script src="https://code.jquery.com/ui/1.12.1/jquery-ui.js" integrity="sha256-T0Vest3yCU7pafRw9r+settMBX6JkKN06dqBnpQ8d30=" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js" integrity="sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1" crossorigin="anonymous"></script>
    <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha384-JjSmVgyd0p3pXB1rRibZUAYoIIy6OrQ6VrjIEaFf/nJGzIxFDsf4x0xIM+B07jRM" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-datepicker/1.9.0/js/bootstrap-datepicker.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
    
</body>
</html>
